"""Model comparison: nested likelihood ratio tests and side-by-side model comparison."""
import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats as sp
from sklearn.metrics import brier_score_loss, roc_auc_score
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


def _fit_model(df: pd.DataFrame, outcome: str, predictors: List[str], model_type: str):
    """Fit a logistic or linear model, return the fitted model object."""
    X = pd.get_dummies(df[predictors], drop_first=True).astype(float)
    X = sm.add_constant(X)
    y = df[outcome].astype(float)

    if model_type == "logistic":
        if y.nunique() < 2:
            raise HTTPException(400, "Outcome must be binary (0/1) with at least one event and one non-event.")
        try:
            model = sm.Logit(y, X).fit(disp=False, maxiter=100)
        except Exception as exc:
            raise HTTPException(400, f"Logistic regression failed: {exc}")
    elif model_type == "linear":
        try:
            model = sm.OLS(y, X).fit()
        except Exception as exc:
            raise HTTPException(400, f"Linear regression failed: {exc}")
    else:
        raise HTTPException(400, f"Unknown model_type '{model_type}'. Use 'logistic' or 'linear'.")

    return model, X, y


# ═══════════════════════════════════════════════════════════════════════════════
# 1. NESTED LIKELIHOOD RATIO TEST
# ═══════════════════════════════════════════════════════════════════════════════

class NestedLRRequest(BaseModel):
    session_id: str
    outcome: str
    predictors_reduced: List[str]
    predictors_full: List[str]
    model_type: str = "logistic"
    imputation: str = "listwise"


@router.post("/nested_lr_test")
def nested_lr_test(req: NestedLRRequest):
    # Validate nesting: reduced predictors must be a subset of full predictors
    if not set(req.predictors_reduced).issubset(set(req.predictors_full)):
        raise HTTPException(400, "Reduced model predictors must be a subset of full model predictors.")

    if set(req.predictors_reduced) == set(req.predictors_full):
        raise HTTPException(400, "Reduced and full models have identical predictors — nothing to test.")

    df_full = _get_df(req.session_id)
    n_total = len(df_full)
    all_cols = list(set([req.outcome] + req.predictors_full))
    df = apply_imputation(df_full, all_cols, req.imputation)
    n_excluded = n_total - len(df)

    if len(df) < len(req.predictors_full) + 10:
        raise HTTPException(400, "Not enough observations relative to number of predictors.")

    model_red, X_red, y_red = _fit_model(df, req.outcome, req.predictors_reduced, req.model_type)
    model_full, X_full, y_full = _fit_model(df, req.outcome, req.predictors_full, req.model_type)

    # ── Log-likelihoods ────────────────────────────────────────────────────
    ll_red = float(model_red.llf)
    ll_full = float(model_full.llf)

    n_params_red = int(model_red.df_model) + 1  # +1 for intercept
    n_params_full = int(model_full.df_model) + 1

    aic_red = float(model_red.aic)
    aic_full = float(model_full.aic)
    bic_red = float(model_red.bic)
    bic_full = float(model_full.bic)

    # ── LR test statistic ──────────────────────────────────────────────────
    lr_stat = -2 * (ll_red - ll_full)
    df_test = n_params_full - n_params_red
    if df_test <= 0:
        raise HTTPException(400, "Full model must have more parameters than reduced model.")

    p_val = float(sp.chi2.sf(lr_stat, df_test))
    sig = bool(p_val < 0.05)
    ps = _p_str(p_val)

    # ── Interpretation ─────────────────────────────────────────────────────
    added_vars = sorted(set(req.predictors_full) - set(req.predictors_reduced))
    added_str = ", ".join(added_vars)

    if sig:
        interpretation = (
            f"The full model (with {added_str}) provides a significantly better fit than the "
            f"reduced model (LR chi2({df_test}) = {lr_stat:.3f}, p = {ps}). "
            f"The additional predictor(s) contribute meaningfully to the model."
        )
    else:
        interpretation = (
            f"The full model (with {added_str}) does not significantly improve fit over the "
            f"reduced model (LR chi2({df_test}) = {lr_stat:.3f}, p = {ps}). "
            f"The simpler model may be preferred."
        )

    result_text = (
        f"Likelihood ratio test comparing nested {req.model_type} models (n = {len(df)}, {n_excluded} excluded). "
        f"Reduced model: {', '.join(req.predictors_reduced)} (LL = {ll_red:.2f}, AIC = {aic_red:.1f}). "
        f"Full model: {', '.join(req.predictors_full)} (LL = {ll_full:.2f}, AIC = {aic_full:.1f}). "
        f"LR chi2({df_test}) = {lr_stat:.3f}, p = {ps}."
    )

    return {
        "test": "Likelihood Ratio Test (nested models)",
        "reduced": {
            "predictors": req.predictors_reduced,
            "ll": round(ll_red, 4),
            "aic": round(aic_red, 4),
            "bic": round(bic_red, 4),
            "n_params": n_params_red,
        },
        "full": {
            "predictors": req.predictors_full,
            "ll": round(ll_full, 4),
            "aic": round(aic_full, 4),
            "bic": round(bic_full, 4),
            "n_params": n_params_full,
        },
        "lr_stat": round(float(lr_stat), 4),
        "df": df_test,
        "p": float(p_val),
        "significant": sig,
        "n": len(df),
        "n_excluded": n_excluded,
        "interpretation": interpretation,
        "result_text": result_text,
        "export_rows": [
            ["Statistic", "Value"],
            ["LR chi-square", round(float(lr_stat), 4)],
            ["df", df_test],
            ["p", round(float(p_val), 6)],
            ["Reduced LL", round(ll_red, 4)],
            ["Full LL", round(ll_full, 4)],
            ["Reduced AIC", round(aic_red, 4)],
            ["Full AIC", round(aic_full, 4)],
            ["Reduced BIC", round(bic_red, 4)],
            ["Full BIC", round(bic_full, 4)],
            ["Reduced n_params", n_params_red],
            ["Full n_params", n_params_full],
            ["n", len(df)],
            ["n excluded", n_excluded],
        ],
        "r_code": "anova(model_reduced, model_full, test = 'LRT')",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 2. COMPARE MODELS (side-by-side)
# ═══════════════════════════════════════════════════════════════════════════════

class CompareModelsRequest(BaseModel):
    session_id: str
    outcome: str
    model_specs: List[dict]  # [{"name": "Model 1", "predictors": ["x1", "x2"]}, ...]
    model_type: str = "logistic"
    imputation: str = "listwise"


@router.post("/compare_models")
def compare_models(req: CompareModelsRequest):
    if len(req.model_specs) < 2:
        raise HTTPException(400, "Need at least 2 model specifications to compare.")
    if len(req.model_specs) > 20:
        raise HTTPException(400, "Maximum 20 models for comparison.")

    df_full = _get_df(req.session_id)
    n_total = len(df_full)

    # Collect all predictor columns to impute uniformly
    all_pred_cols = set()
    for spec in req.model_specs:
        preds = spec.get("predictors", [])
        if not preds:
            raise HTTPException(400, f"Model '{spec.get('name', '?')}' has no predictors.")
        all_pred_cols.update(preds)
    all_cols = list(set([req.outcome]) | all_pred_cols)

    df = apply_imputation(df_full, all_cols, req.imputation)
    n_excluded = n_total - len(df)

    if len(df) < 20:
        raise HTTPException(400, "Need at least 20 complete observations for model comparison.")

    models_out = []
    for spec in req.model_specs:
        name = spec.get("name", f"Model {len(models_out) + 1}")
        predictors = spec["predictors"]

        try:
            fitted, X, y = _fit_model(df, req.outcome, predictors, req.model_type)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(400, f"Model '{name}' fitting failed: {exc}")

        n_params = int(fitted.df_model) + 1
        ll = round(float(fitted.llf), 4)
        aic = round(float(fitted.aic), 4)
        bic = round(float(fitted.bic), 4)

        entry = {
            "name": name,
            "predictors": predictors,
            "n": len(df),
            "n_params": n_params,
            "aic": aic,
            "bic": bic,
            "ll": ll,
        }

        if req.model_type == "logistic":
            # Pseudo R-squared (McFadden)
            pseudo_r2 = round(float(fitted.prsquared), 4)
            entry["r_squared"] = pseudo_r2

            # C-statistic (AUC)
            probs = fitted.predict(X).values
            y_vals = y.values
            try:
                c_stat = round(float(roc_auc_score(y_vals, probs)), 4)
            except ValueError:
                c_stat = None
            entry["c_statistic"] = c_stat

            # Brier score
            brier = round(float(brier_score_loss(y_vals, probs)), 4)
            entry["brier_score"] = brier

        elif req.model_type == "linear":
            r2 = round(float(fitted.rsquared), 4)
            r2_adj = round(float(fitted.rsquared_adj), 4)
            entry["r_squared"] = r2
            entry["r_squared_adj"] = r2_adj
            entry["c_statistic"] = None
            entry["brier_score"] = None

        models_out.append(entry)

    # ── Rank by AIC (lower = better) ───────────────────────────────────────
    aic_vals = [m["aic"] for m in models_out]
    sorted_indices = np.argsort(aic_vals)
    for rank, idx in enumerate(sorted_indices):
        models_out[idx]["rank_aic"] = rank + 1

    best_idx = int(sorted_indices[0])
    best_model = models_out[best_idx]["name"]

    # ── Result text ────────────────────────────────────────────────────────
    model_summaries = []
    for m in sorted(models_out, key=lambda x: x["rank_aic"]):
        parts = [f"{m['name']} (AIC = {m['aic']}, BIC = {m['bic']}"]
        if m.get("c_statistic") is not None:
            parts.append(f"C = {m['c_statistic']}")
        if m.get("r_squared") is not None:
            r2_label = "pseudo-R2" if req.model_type == "logistic" else "R2"
            parts.append(f"{r2_label} = {m['r_squared']}")
        model_summaries.append(", ".join(parts) + ")")

    result_text = (
        f"Model comparison of {len(req.model_specs)} {req.model_type} models "
        f"(n = {len(df)}, {n_excluded} excluded). "
        f"Best model by AIC: {best_model}. "
        + " | ".join(model_summaries)
    )

    # ── Export rows ────────────────────────────────────────────────────────
    header = ["Model", "Predictors", "n_params", "AIC", "BIC", "LL", "R2/pseudo-R2"]
    if req.model_type == "logistic":
        header += ["C-statistic", "Brier"]
    header.append("Rank (AIC)")

    export_rows = [header]
    for m in sorted(models_out, key=lambda x: x["rank_aic"]):
        row = [
            m["name"],
            ", ".join(m["predictors"]),
            m["n_params"],
            m["aic"],
            m["bic"],
            m["ll"],
            m["r_squared"],
        ]
        if req.model_type == "logistic":
            row += [m.get("c_statistic"), m.get("brier_score")]
        row.append(m["rank_aic"])
        export_rows.append(row)

    # ── R code ─────────────────────────────────────────────────────────────
    r_lines = []
    for i, spec in enumerate(req.model_specs):
        preds_str = " + ".join(spec["predictors"])
        fam = "family = binomial" if req.model_type == "logistic" else ""
        func = "glm" if req.model_type == "logistic" else "lm"
        fam_arg = f", {fam}" if fam else ""
        r_lines.append(f"m{i+1} <- {func}({req.outcome} ~ {preds_str}, data = data{fam_arg})")
    r_lines.append(f"AIC({', '.join(f'm{i+1}' for i in range(len(req.model_specs)))})")
    r_lines.append(f"BIC({', '.join(f'm{i+1}' for i in range(len(req.model_specs)))})")
    r_code = "\n".join(r_lines)

    return {
        "test": "Model Comparison",
        "models": models_out,
        "best_model": best_model,
        "n": len(df),
        "n_excluded": n_excluded,
        "result_text": result_text,
        "export_rows": export_rows,
        "r_code": r_code,
    }
