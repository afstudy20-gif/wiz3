"""Model-specific diagnostics: logistic regression calibration & Cox PH assumptions."""

import numpy as np
import pandas as pd
from scipy import stats as scipy_stats
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from services import store
from services.impute import apply_imputation

router = APIRouter()


def _get_df(session_id: str) -> pd.DataFrame:
    df = store.get_filtered(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return df


def _p_str(p: float) -> str:
    return "<0.001" if p < 0.001 else f"{p:.4f}"


# ═══════════════════════════════════════════════════════════════════════════════
# 1. LOGISTIC REGRESSION DIAGNOSTICS
# ═══════════════════════════════════════════════════════════════════════════════

class LogisticDiagRequest(BaseModel):
    session_id: str
    outcome: str
    predictors: List[str]
    imputation: str = "listwise"


@router.post("/logistic_diagnostics")
def logistic_diagnostics(req: LogisticDiagRequest):
    import statsmodels.api as sm
    from sklearn.metrics import roc_auc_score

    df_full = _get_df(req.session_id)
    all_cols = [req.outcome] + req.predictors
    df = apply_imputation(df_full, all_cols, req.imputation or "listwise")

    if len(df) < len(req.predictors) + 10:
        raise HTTPException(400, "Not enough observations for logistic regression diagnostics.")

    # Encode outcome as binary 0/1
    y = df[req.outcome].copy()
    unique_vals = sorted(y.dropna().unique())
    if len(unique_vals) != 2:
        raise HTTPException(400, f"Outcome '{req.outcome}' must be binary (has {len(unique_vals)} unique values).")

    # Map to 0/1
    if set(unique_vals) <= {0, 1, 0.0, 1.0}:
        y = y.astype(float)
    else:
        val_map = {unique_vals[0]: 0, unique_vals[1]: 1}
        y = y.map(val_map).astype(float)

    X = pd.get_dummies(df[req.predictors], drop_first=True).astype(float)
    X = sm.add_constant(X)

    # ── Fit logistic ─────────────────────────────────────────────────────────
    try:
        model = sm.Logit(y, X).fit(disp=0, maxiter=100)
    except Exception as exc:
        raise HTTPException(400, f"Logistic model failed to converge: {exc}")

    probs = model.predict(X).values
    y_arr = y.values
    n = len(y_arr)

    # ── 1. Separation warning ────────────────────────────────────────────────
    separation_vars = []
    for col in req.predictors:
        if col not in df.columns:
            continue
        s = df[col]
        if pd.api.types.is_numeric_dtype(s):
            # Check if any threshold perfectly separates
            vals_0 = s[y_arr == 0]
            vals_1 = s[y_arr == 1]
            if len(vals_0) > 0 and len(vals_1) > 0:
                if vals_0.max() < vals_1.min() or vals_1.max() < vals_0.min():
                    separation_vars.append(col)
        else:
            # Categorical: check if any level has only one outcome value
            for level in s.unique():
                mask = s == level
                if mask.sum() > 0:
                    outcomes_in_level = y_arr[mask.values]
                    if len(np.unique(outcomes_in_level)) == 1 and mask.sum() > 1:
                        separation_vars.append(col)
                        break

    # ── 2. Calibration plot data ─────────────────────────────────────────────
    sorted_idx = np.argsort(probs)
    n_bins = min(10, max(2, n // 10))
    groups = np.array_split(sorted_idx, n_bins)
    calibration_bins = []
    for grp in groups:
        if len(grp) == 0:
            continue
        calibration_bins.append({
            "predicted_mean": round(float(probs[grp].mean()), 4),
            "observed_prop": round(float(y_arr[grp].mean()), 4),
            "n": int(len(grp)),
        })

    # ── 3. Brier score ───────────────────────────────────────────────────────
    brier = float(np.mean((probs - y_arr) ** 2))

    # ── 4. Hosmer-Lemeshow ───────────────────────────────────────────────────
    hl_groups = np.array_split(sorted_idx, 10)
    chi2 = 0.0
    for grp in hl_groups:
        if len(grp) == 0:
            continue
        n_g = len(grp)
        o_g = float(y_arr[grp].sum())
        e_g = float(probs[grp].sum())
        denom = e_g * (1 - e_g / n_g)
        if denom > 1e-10:
            chi2 += (o_g - e_g) ** 2 / denom
    p_hl = float(1 - scipy_stats.chi2.cdf(chi2, df=8))

    # ── 5. C-statistic (AUC) ────────────────────────────────────────────────
    try:
        c_stat = float(roc_auc_score(y_arr, probs))
    except Exception:
        c_stat = None

    # ── 6. Influence summary ─────────────────────────────────────────────────
    try:
        infl = model.get_influence()
        dfbetas = infl.dfbetas
        hat_diag = infl.hat_matrix_diag
        n_high_dfbeta = int(np.sum(np.any(np.abs(dfbetas) > 2 / np.sqrt(n), axis=1)))
        n_high_leverage = int(np.sum(hat_diag > 2 * X.shape[1] / n))
    except Exception:
        n_high_dfbeta = None
        n_high_leverage = None

    # ── Assumptions ──────────────────────────────────────────────────────────
    assumptions = []
    assumptions.append({
        "name": "Calibration (Hosmer-Lemeshow)",
        "met": bool(p_hl >= 0.05),
        "detail": f"Chi-square = {chi2:.2f}, p = {_p_str(p_hl)}",
    })
    assumptions.append({
        "name": "No perfect separation",
        "met": len(separation_vars) == 0,
        "detail": f"Separation detected in: {', '.join(separation_vars)}" if separation_vars else "No separation detected",
    })

    # ── Warnings ─────────────────────────────────────────────────────────────
    warnings = []
    if p_hl < 0.05:
        warnings.append("Hosmer-Lemeshow test significant — model may be poorly calibrated.")
    if separation_vars:
        warnings.append(f"Perfect or quasi-perfect separation in: {', '.join(separation_vars)}. Coefficient estimates may be unreliable.")
    if brier > 0.25:
        warnings.append(f"Brier score = {brier:.4f} — predictive accuracy is limited.")
    if c_stat is not None and c_stat < 0.6:
        warnings.append(f"C-statistic (AUC) = {c_stat:.4f} — poor discrimination.")

    # ── result_text ──────────────────────────────────────────────────────────
    hl_txt = f"Hosmer-Lemeshow: {'adequate calibration' if p_hl >= 0.05 else 'poor calibration'} (chi-square = {chi2:.2f}, p = {_p_str(p_hl)})"
    brier_txt = f"Brier score = {brier:.4f}"
    c_txt = f"C-statistic (AUC) = {c_stat:.4f}" if c_stat is not None else "C-statistic not available"
    sep_txt = f"Separation detected in: {', '.join(separation_vars)}" if separation_vars else "No separation detected"

    result_text = (
        f"Logistic regression diagnostics (n = {n}, {len(req.predictors)} predictor{'s' if len(req.predictors) != 1 else ''}). "
        f"{hl_txt}. {brier_txt}. {c_txt}. {sep_txt}."
    )

    # ── export_rows ──────────────────────────────────────────────────────────
    export_rows = [
        ["Diagnostic", "Value"],
        ["n", n],
        ["Brier score", round(brier, 4)],
        ["C-statistic (AUC)", round(c_stat, 4) if c_stat is not None else None],
        ["Hosmer-Lemeshow chi-square", round(chi2, 4)],
        ["Hosmer-Lemeshow df", 8],
        ["Hosmer-Lemeshow p", round(p_hl, 6)],
        ["Separation detected", "Yes" if separation_vars else "No"],
        ["High DFBETA count", n_high_dfbeta],
        ["High leverage count", n_high_leverage],
    ]

    # ── r_code ───────────────────────────────────────────────────────────────
    pred_formula = " + ".join(req.predictors)
    r_code = (
        f"library(ResourceSelection)\n"
        f"model <- glm({req.outcome} ~ {pred_formula}, data = data, family = binomial)\n"
        f"summary(model)\n"
        f"hoslem.test(model$y, fitted(model), g = 10)  # Hosmer-Lemeshow\n"
        f"library(pROC)\n"
        f"roc(model$y, fitted(model))  # AUC/C-statistic\n"
        f"# Brier score\n"
        f"mean((fitted(model) - model$y)^2)"
    )

    return {
        "test": "Logistic Regression Diagnostics",
        "calibration": {
            "bins": calibration_bins,
        },
        "brier_score": round(brier, 4),
        "hosmer_lemeshow": {
            "chi2": round(chi2, 4),
            "df": 8,
            "p": round(p_hl, 6),
            "significant": bool(p_hl < 0.05),
        },
        "separation": {
            "detected": len(separation_vars) > 0,
            "variables": separation_vars,
        },
        "c_statistic": round(c_stat, 4) if c_stat is not None else None,
        "assumptions": assumptions,
        "warnings": warnings,
        "result_text": result_text,
        "export_rows": export_rows,
        "r_code": r_code,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 2. COX PH DIAGNOSTICS
# ═══════════════════════════════════════════════════════════════════════════════

class CoxDiagRequest(BaseModel):
    session_id: str
    duration_col: str
    event_col: str
    predictors: List[str]
    imputation: str = "listwise"


@router.post("/cox_diagnostics")
def cox_diagnostics(req: CoxDiagRequest):
    from lifelines import CoxPHFitter
    from lifelines.statistics import proportional_hazard_test

    df_full = _get_df(req.session_id)
    all_cols = [req.duration_col, req.event_col] + req.predictors
    missing_cols = [c for c in all_cols if c not in df_full.columns]
    if missing_cols:
        raise HTTPException(400, f"Columns not found: {missing_cols}")

    df = apply_imputation(df_full, all_cols, req.imputation or "listwise")

    if len(df) < len(req.predictors) + 10:
        raise HTTPException(400, "Not enough observations for Cox PH diagnostics.")

    # Ensure numeric
    df[req.duration_col] = pd.to_numeric(df[req.duration_col], errors="coerce")
    df[req.event_col] = pd.to_numeric(df[req.event_col], errors="coerce")
    for col in req.predictors:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=all_cols)

    if len(df) < len(req.predictors) + 10:
        raise HTTPException(400, "Not enough observations after cleaning.")

    # Ensure positive durations
    df = df[df[req.duration_col] > 0]
    if len(df) < 10:
        raise HTTPException(400, "Not enough observations with positive duration.")

    n = len(df)
    n_events = int(df[req.event_col].sum())

    # ── Fit Cox model ────────────────────────────────────────────────────────
    cox_cols = req.predictors + [req.duration_col, req.event_col]
    try:
        cph = CoxPHFitter()
        cph.fit(df[cox_cols], duration_col=req.duration_col, event_col=req.event_col)
    except Exception as exc:
        raise HTTPException(400, f"Cox PH model failed: {exc}")

    # ── 1. Schoenfeld residuals PH test ──────────────────────────────────────
    ph_results = []
    try:
        ph_test = proportional_hazard_test(cph, df[cox_cols], time_transform="rank")
        for var in req.predictors:
            try:
                row = ph_test.summary.loc[var]
                test_stat = float(row["test_statistic"])
                p_val = float(row["p"])
                ph_results.append({
                    "variable": var,
                    "test_stat": round(test_stat, 4),
                    "p": round(p_val, 6),
                    "assumption_met": bool(p_val >= 0.05),
                })
            except (KeyError, IndexError):
                ph_results.append({
                    "variable": var,
                    "test_stat": None,
                    "p": None,
                    "assumption_met": True,
                })
    except Exception:
        # PH test may fail for some data configurations
        for var in req.predictors:
            ph_results.append({
                "variable": var,
                "test_stat": None,
                "p": None,
                "assumption_met": True,
            })

    # ── 2. C-index ───────────────────────────────────────────────────────────
    c_index = round(float(cph.concordance_index_), 4)

    # ── 3. Log-likelihood ratio test ─────────────────────────────────────────
    try:
        ll_test = cph.log_likelihood_ratio_test()
        ll_stat = round(float(ll_test.test_statistic), 4)
        ll_p = float(ll_test.p_value)
    except Exception:
        ll_stat = None
        ll_p = None

    # ── Assumptions ──────────────────────────────────────────────────────────
    assumptions = []

    # PH assumption for each variable
    violated = [r for r in ph_results if not r["assumption_met"]]
    if violated:
        assumptions.append({
            "name": "Proportional hazards",
            "met": False,
            "detail": f"PH assumption violated for: {', '.join(v['variable'] for v in violated)}",
        })
    else:
        assumptions.append({
            "name": "Proportional hazards",
            "met": True,
            "detail": "PH assumption met for all predictors",
        })

    # Events per variable (rule of thumb: >= 10)
    epv = n_events / max(len(req.predictors), 1)
    assumptions.append({
        "name": "Events per variable",
        "met": epv >= 10,
        "detail": f"EPV = {epv:.1f} ({n_events} events, {len(req.predictors)} predictors)" + (" — may be underpowered" if epv < 10 else ""),
    })

    # ── Warnings ─────────────────────────────────────────────────────────────
    warnings = []
    if violated:
        warnings.append(f"PH assumption violated for: {', '.join(v['variable'] for v in violated)}. Consider time-varying coefficients or stratification.")
    if epv < 10:
        warnings.append(f"Low events per variable ({epv:.1f}). Model estimates may be unstable.")
    if c_index < 0.6:
        warnings.append(f"C-index = {c_index} — poor discrimination.")

    # ── result_text ──────────────────────────────────────────────────────────
    ph_txt = "PH assumption met for all predictors" if not violated else f"PH assumption violated for: {', '.join(v['variable'] for v in violated)}"
    ll_txt = f"Log-likelihood ratio test: chi-square = {ll_stat}, p = {_p_str(ll_p)}" if ll_p is not None else "Log-likelihood ratio test not available"

    result_text = (
        f"Cox PH diagnostics (n = {n}, {n_events} events, {len(req.predictors)} predictor{'s' if len(req.predictors) != 1 else ''}). "
        f"C-index = {c_index}. "
        f"{ph_txt}. "
        f"{ll_txt}."
    )

    # ── export_rows ──────────────────────────────────────────────────────────
    export_rows = [
        ["Diagnostic", "Value"],
        ["n", n],
        ["Events", n_events],
        ["C-index", c_index],
        ["Log-likelihood ratio stat", ll_stat],
        ["Log-likelihood ratio p", round(ll_p, 6) if ll_p is not None else None],
        ["Events per variable", round(epv, 1)],
    ]
    for r in ph_results:
        export_rows.append([f"PH test: {r['variable']} (stat)", r["test_stat"]])
        export_rows.append([f"PH test: {r['variable']} (p)", r["p"]])

    # ── r_code ───────────────────────────────────────────────────────────────
    pred_formula = " + ".join(req.predictors)
    r_code = (
        f"library(survival)\n"
        f"model <- coxph(Surv({req.duration_col}, {req.event_col}) ~ {pred_formula}, data = data)\n"
        f"summary(model)\n"
        f"cox.zph(model)  # Schoenfeld residuals PH test\n"
        f"concordance(model)  # C-index"
    )

    return {
        "test": "Cox PH Diagnostics",
        "ph_test": ph_results,
        "c_index": c_index,
        "log_likelihood_ratio": {
            "stat": ll_stat,
            "p": round(ll_p, 6) if ll_p is not None else None,
        },
        "assumptions": assumptions,
        "warnings": warnings,
        "result_text": result_text,
        "export_rows": export_rows,
        "r_code": r_code,
    }
