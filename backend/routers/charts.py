import json as _json
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from services import store

router = APIRouter()


def _get_df(session_id: str) -> pd.DataFrame:
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return df


class ChartRequest(BaseModel):
    session_id: str
    x: str
    y: Optional[str] = None
    color: Optional[str] = None
    shape: Optional[str] = None
    bins: int = 20


@router.post("/histogram")
def histogram(req: ChartRequest):
    df = _get_df(req.session_id)
    s = df[req.x].dropna()
    counts, edges = np.histogram(s, bins=req.bins)
    kde_x = np.linspace(s.min(), s.max(), 200)
    kde = scipy_stats.gaussian_kde(s)
    return {
        "type": "histogram",
        "x": req.x,
        "bins": [{"x0": float(edges[i]), "x1": float(edges[i+1]), "count": int(counts[i])} for i in range(len(counts))],
        "kde": [{"x": float(kx), "y": float(ky)} for kx, ky in zip(kde_x, kde(kde_x))],
        "stats": {"mean": float(s.mean()), "median": float(s.median()), "std": float(s.std())},
    }


@router.post("/scatter")
def scatter(req: ChartRequest):
    df = _get_df(req.session_id)

    # Build deduplicated column list
    needed = [req.x, req.y]
    if req.color and req.color not in needed:
        needed.append(req.color)
    if req.shape and req.shape not in needed:
        needed.append(req.shape)

    for col in needed:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{col}' not found")

    # Clean: replace inf→nan on numeric cols only, then drop missing
    sub = df[needed].copy()
    for col in needed:
        if sub[col].dtype.kind in ("f", "i", "u"):
            sub[col] = sub[col].replace([np.inf, -np.inf], np.nan)
    sub = sub.dropna()

    if len(sub) < 2:
        raise HTTPException(status_code=400, detail="Not enough non-missing data points to draw scatter (need ≥ 2)")

    # Regression only when both axes are numeric
    x_numeric = df[req.x].dtype.kind in ("f", "i", "u")
    y_numeric = df[req.y].dtype.kind in ("f", "i", "u")

    reg: dict = {}
    if x_numeric and y_numeric:
        x_arr = sub[req.x].astype(float).tolist()
        y_arr = sub[req.y].astype(float).tolist()
        try:
            slope, intercept, r, p, se = scipy_stats.linregress(x_arr, y_arr)
            if np.isnan(r) or np.isinf(r):
                raise ValueError("degenerate")
            line_x = [float(sub[req.x].min()), float(sub[req.x].max())]
            line_y = [float(slope * lx + intercept) for lx in line_x]
            reg = {
                "slope": float(slope), "intercept": float(intercept),
                "r": float(r), "r2": float(r ** 2),
                "p": float(p), "se": float(se),
                "line_x": line_x, "line_y": line_y,
            }
        except Exception:
            reg = {
                "slope": None, "intercept": None,
                "r": None, "r2": None, "p": None, "se": None,
                "line_x": [], "line_y": [],
                "note": "Regression unavailable (constant or degenerate data)",
            }
    else:
        reg = {
            "slope": None, "intercept": None,
            "r": None, "r2": None, "p": None, "se": None,
            "line_x": [], "line_y": [],
            "note": "Regression requires two numeric axes",
        }

    # Serialize points safely (NaN → null via json round-trip)
    points = _json.loads(sub.to_json(orient="records", default_handler=str, date_format="iso", date_unit="s"))

    return {
        "type": "scatter",
        "x": req.x, "y": req.y,
        "points": points,
        "regression": reg,
        "color": req.color,
    }


@router.post("/boxplot")
def boxplot(req: ChartRequest):
    df = _get_df(req.session_id)
    if req.color:
        groups = df.groupby(req.color)[req.x].apply(lambda s: s.dropna().tolist()).to_dict()
        result = [{"group": str(k), "values": v} for k, v in groups.items()]
    else:
        result = [{"group": "All", "values": df[req.x].dropna().tolist()}]
    return {"type": "boxplot", "x": req.x, "groups": result}


class SplomRequest(BaseModel):
    session_id: str
    variables: List[str]
    color: Optional[str] = None


@router.post("/splom")
def splom(req: SplomRequest):
    df = _get_df(req.session_id)

    if len(req.variables) < 2:
        raise HTTPException(status_code=400, detail="Select at least 2 variables")

    needed = list(req.variables)
    if req.color and req.color not in needed:
        needed.append(req.color)

    for col in needed:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{col}' not found")

    sub = df[needed].replace([np.inf, -np.inf], np.nan).dropna()

    if len(sub) < 3:
        raise HTTPException(status_code=400, detail="Not enough data after removing missing values (need ≥ 3 rows)")

    # Build column arrays
    data_cols = {col: sub[col].tolist() for col in req.variables}
    color_values = sub[req.color].tolist() if req.color else None

    # Pairwise Pearson r matrix
    corr: dict = {}
    for a in req.variables:
        for b in req.variables:
            if a == b:
                corr[f"{a}||{b}"] = 1.0
            else:
                key = f"{a}||{b}"
                try:
                    r, _ = scipy_stats.pearsonr(sub[a].astype(float), sub[b].astype(float))
                    corr[key] = round(float(r), 4) if not (np.isnan(r) or np.isinf(r)) else None
                except Exception:
                    corr[key] = None

    return {
        "variables": req.variables,
        "n": len(sub),
        "data": data_cols,
        "color": req.color,
        "color_values": color_values,
        "corr": corr,
    }


@router.post("/bar")
def bar(req: ChartRequest):
    df = _get_df(req.session_id)
    if req.y:
        grp = df.groupby(req.x)[req.y].mean().reset_index()
        return {
            "type": "bar",
            "x": req.x, "y": req.y,
            "data": [{"label": str(row[req.x]), "value": float(row[req.y])} for _, row in grp.iterrows()],
        }
    else:
        counts = df[req.x].value_counts()
        return {
            "type": "bar",
            "x": req.x, "y": "count",
            "data": [{"label": str(k), "value": int(v)} for k, v in counts.items()],
        }
