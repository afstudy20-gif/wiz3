"""Session management: cell editing and dataset export."""
import io
import numpy as np
import pandas as pd
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from services import store

router = APIRouter()


# ── Cell editing ───────────────────────────────────────────────────────────────

class CellUpdate(BaseModel):
    row_index: int
    column: str
    value: Optional[Any] = None  # string, number, or null from frontend


@router.patch("/{session_id}/cell")
async def update_cell(session_id: str, body: CellUpdate):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if body.column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{body.column}' not found")
    if body.row_index < 0 or body.row_index >= len(df):
        raise HTTPException(status_code=400, detail=f"Row index {body.row_index} out of range")

    col_dtype = df[body.column].dtype
    val = body.value

    # Coerce to column dtype
    if val is not None and val != "":
        try:
            if col_dtype.kind in ("i", "u"):
                val = int(float(str(val)))
            elif col_dtype.kind == "f":
                val = float(str(val))
        except (ValueError, TypeError):
            pass  # keep as string
    else:
        val = np.nan  # blank → missing

    df.at[body.row_index, body.column] = val
    store.save(session_id, df)

    stored = df.at[body.row_index, body.column]
    try:
        if isinstance(stored, float) and (np.isnan(stored) or np.isinf(stored)):
            stored = None
    except (TypeError, ValueError):
        pass

    return {"row_index": body.row_index, "column": body.column, "value": stored}


# ── Export ─────────────────────────────────────────────────────────────────────

@router.get("/{session_id}/export")
async def export_dataset(
    session_id: str,
    fmt: str = Query("csv", regex="^(csv|tsv|xlsx)$"),
    filename: str = Query("data"),
):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")

    # Strip any extension the user might have included
    base = filename.rsplit(".", 1)[0] if "." in filename else filename

    if fmt == "csv":
        buf = io.StringIO()
        df.to_csv(buf, index=False)
        content = buf.getvalue().encode("utf-8-sig")  # BOM for Excel compat
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{base}.csv"'},
        )

    if fmt == "tsv":
        buf = io.StringIO()
        df.to_csv(buf, index=False, sep="\t")
        content = buf.getvalue().encode("utf-8-sig")
        return Response(
            content=content,
            media_type="text/tab-separated-values",
            headers={"Content-Disposition": f'attachment; filename="{base}.tsv"'},
        )

    if fmt == "xlsx":
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Data")
        buf.seek(0)
        return Response(
            content=buf.read(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{base}.xlsx"'},
        )
