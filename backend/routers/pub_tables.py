"""Publication-ready table formatting and export."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, Dict

from services.journal_formatter import format_table1_for_journal, export_journal_excel, export_journal_word

router = APIRouter()


class FormatRequest(BaseModel):
    table1_result: dict  # raw Table 1 result from /api/stats/table1
    options: Optional[Dict] = None  # {bold_significant_p, show_test_column, table_number}


@router.post("/format")
def format_for_journal(req: FormatRequest):
    """Convert Table 1 result into AMA journal-formatted output."""
    try:
        return format_table1_for_journal(req.table1_result, req.options)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Formatting failed: {exc}")


class ExportRequest(BaseModel):
    formatted_table: dict  # output of /format endpoint
    format: str = "xlsx"  # "xlsx" or "docx"


@router.post("/export")
def export_formatted(req: ExportRequest):
    """Export formatted table as Excel or Word."""
    try:
        if req.format == "docx":
            content = export_journal_word(req.formatted_table)
            filename = "Table_1_AMA.docx"
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        else:
            content = export_journal_excel(req.formatted_table)
            filename = "Table_1_AMA.xlsx"
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

        safe_fn = filename.encode("ascii", "ignore").decode()
        return Response(
            content=content,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{safe_fn}"'},
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Export failed: {exc}")
