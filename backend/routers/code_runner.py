"""Server-side code execution endpoint.

Disabled by default — set `ENABLE_CODE_RUNNER=1` in the backend environment
to expose it. Returns 503 when disabled.

Threat model and operational limits are documented in `backend/SECURITY.md`.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from collections import deque
from pathlib import Path
from threading import Lock
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services import store
from services.sandbox import MAX_CODE_BYTES, MAX_TIMEOUT_S, run_python

router = APIRouter()
logger = logging.getLogger(__name__)


def _enabled() -> bool:
    return os.environ.get("ENABLE_CODE_RUNNER", "").lower() in ("1", "true", "yes", "on")


# ── Rate limiting (in-memory; sessions are ephemeral) ────────────────────────

_RATE_LOCK = Lock()
_RATE: dict[str, deque[float]] = {}
_RATE_LIMIT_PER_MIN = 6
_RATE_LIMIT_PER_HOUR = 30


def _check_rate(session_id: str) -> None:
    now = time.time()
    with _RATE_LOCK:
        bucket = _RATE.setdefault(session_id, deque())
        # Prune entries older than 1h
        while bucket and now - bucket[0] > 3600:
            bucket.popleft()
        last_min = sum(1 for t in bucket if now - t < 60)
        if last_min >= _RATE_LIMIT_PER_MIN:
            raise HTTPException(status_code=429, detail=f"Rate limit: max {_RATE_LIMIT_PER_MIN} runs/min per session.")
        if len(bucket) >= _RATE_LIMIT_PER_HOUR:
            raise HTTPException(status_code=429, detail=f"Rate limit: max {_RATE_LIMIT_PER_HOUR} runs/hour per session.")
        bucket.append(now)


# ── Audit log ───────────────────────────────────────────────────────────────

_AUDIT_PATH = Path(__file__).resolve().parents[1] / "logs" / "code_runner.jsonl"
_AUDIT_LOCK = Lock()


def _audit(entry: dict) -> None:
    try:
        _AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with _AUDIT_LOCK, _AUDIT_PATH.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry) + "\n")
    except Exception:
        logger.exception("code_runner audit log write failed")


# ── Request / Response schemas ──────────────────────────────────────────────

class CodeRunRequest(BaseModel):
    session_id: str
    code: str = Field(..., max_length=MAX_CODE_BYTES)
    timeout: int = Field(default=30, ge=1, le=MAX_TIMEOUT_S)


class CodeRunResponse(BaseModel):
    stdout: str
    stderr: str
    figures: list[str]
    exit_code: int
    time_used_s: float
    error: Optional[str]
    timed_out: bool


@router.get("/status")
def code_runner_status() -> dict:
    """Quick probe so the frontend can hide the Code tab when disabled."""
    return {
        "enabled":   _enabled(),
        "max_timeout_s": MAX_TIMEOUT_S,
        "max_code_bytes": MAX_CODE_BYTES,
        "rate_limit_per_min":  _RATE_LIMIT_PER_MIN,
        "rate_limit_per_hour": _RATE_LIMIT_PER_HOUR,
    }


@router.post("/run", response_model=CodeRunResponse)
def code_runner_run(req: CodeRunRequest) -> CodeRunResponse:
    if not _enabled():
        raise HTTPException(status_code=503, detail="Code execution is disabled on this server. Set ENABLE_CODE_RUNNER=1 to enable.")
    _check_rate(req.session_id)

    df = store.get_filtered(req.session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")

    code_hash = hashlib.sha256(req.code.encode("utf-8")).hexdigest()[:16]
    code_preview = req.code[:200].replace("\n", "\\n")
    started = time.time()

    res = run_python(req.code, df=df, timeout=req.timeout)

    timed_out = bool(res.error and "timeout" in res.error.lower())

    _audit({
        "ts":            round(started, 3),
        "session_id":    req.session_id,
        "code_hash":     code_hash,
        "code_preview":  code_preview,
        "duration_s":    res.time_used_s,
        "exit_code":     res.exit_code,
        "n_figures":     len(res.figures),
        "stdout_bytes":  len(res.stdout.encode("utf-8")),
        "stderr_bytes":  len(res.stderr.encode("utf-8")),
        "error":         res.error,
        "timed_out":     timed_out,
    })

    return CodeRunResponse(
        stdout      = res.stdout[-50_000:],   # cap response payload
        stderr      = res.stderr[-50_000:],
        figures     = res.figures[:20],       # cap to 20 figures per run
        exit_code   = res.exit_code,
        time_used_s = res.time_used_s,
        error       = res.error,
        timed_out   = timed_out,
    )
