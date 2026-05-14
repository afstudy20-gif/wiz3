"""Server-side code execution endpoint.

Disabled by default — set `ENABLE_CODE_RUNNER=1` in the backend environment
to expose it. Returns 503 when disabled.

Rate-limit knobs (all read at request time so a redeploy is not required for
env changes — `os.environ.get` is called per check):

| Env var                        | Default | Meaning                                        |
|--------------------------------|---------|------------------------------------------------|
| `CODE_RUNNER_PER_MIN`          | 6       | Max runs / minute / session_id                 |
| `CODE_RUNNER_PER_HOUR`         | 30      | Max runs / hour / session_id                   |
| `CODE_RUNNER_IP_PER_MIN`       | 10      | Max runs / minute / IP (across all sessions)   |
| `CODE_RUNNER_IP_PER_HOUR`      | 60      | Max runs / hour / IP                           |
| `CODE_RUNNER_GLOBAL_PER_MIN`   | 30      | Max runs / minute server-wide                  |
| `CODE_RUNNER_MAX_CONCURRENT`   | 2       | Max concurrent in-flight runs                  |

Set tighter values in production (`/env` on Render or `envVars` block in
`render.yaml`). Threat model and operational limits are documented in
`backend/SECURITY.md`.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from collections import deque
from pathlib import Path
from threading import BoundedSemaphore, Lock
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from services import store
from services.sandbox import MAX_CODE_BYTES, MAX_TIMEOUT_S, run_python

router = APIRouter()
logger = logging.getLogger(__name__)


def _enabled() -> bool:
    return os.environ.get("ENABLE_CODE_RUNNER", "").lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        v = int(raw)
        return v if v > 0 else default
    except ValueError:
        return default


def _limits() -> dict:
    """Resolve current limits from env (re-read every request)."""
    return {
        "per_min":         _env_int("CODE_RUNNER_PER_MIN", 6),
        "per_hour":        _env_int("CODE_RUNNER_PER_HOUR", 30),
        "ip_per_min":      _env_int("CODE_RUNNER_IP_PER_MIN", 10),
        "ip_per_hour":     _env_int("CODE_RUNNER_IP_PER_HOUR", 60),
        "global_per_min":  _env_int("CODE_RUNNER_GLOBAL_PER_MIN", 30),
        "max_concurrent":  _env_int("CODE_RUNNER_MAX_CONCURRENT", 2),
    }


# ── Rate-limit state (in-memory; sessions are ephemeral) ────────────────────

_RATE_LOCK = Lock()
_BY_SESSION: dict[str, deque[float]] = {}
_BY_IP:      dict[str, deque[float]] = {}
_GLOBAL:     deque[float] = deque()

# Concurrency limiter — rebuilt when env changes
_SEM_LOCK = Lock()
_SEM_SIZE: Optional[int] = None
_SEM: Optional[BoundedSemaphore] = None


def _get_semaphore(size: int) -> BoundedSemaphore:
    """Return a BoundedSemaphore sized to the current concurrency cap.

    Rebuilds the semaphore when the env knob is changed via redeploy.
    """
    global _SEM, _SEM_SIZE
    with _SEM_LOCK:
        if _SEM is None or _SEM_SIZE != size:
            _SEM = BoundedSemaphore(size)
            _SEM_SIZE = size
        return _SEM


def _prune(bucket: deque[float], now: float, window: float) -> None:
    while bucket and now - bucket[0] > window:
        bucket.popleft()


def _check_rate(session_id: str, ip: str, lim: dict) -> None:
    now = time.time()
    with _RATE_LOCK:
        sess = _BY_SESSION.setdefault(session_id, deque())
        ipb  = _BY_IP.setdefault(ip, deque())
        _prune(sess, now, 3600)
        _prune(ipb, now, 3600)
        _prune(_GLOBAL, now, 60)

        sess_min = sum(1 for t in sess if now - t < 60)
        ip_min   = sum(1 for t in ipb  if now - t < 60)

        if sess_min >= lim["per_min"]:
            raise HTTPException(status_code=429, detail=f"Rate limit: max {lim['per_min']} runs/min per session.")
        if len(sess) >= lim["per_hour"]:
            raise HTTPException(status_code=429, detail=f"Rate limit: max {lim['per_hour']} runs/hour per session.")
        if ip_min >= lim["ip_per_min"]:
            raise HTTPException(status_code=429, detail=f"Rate limit: max {lim['ip_per_min']} runs/min per IP.")
        if len(ipb) >= lim["ip_per_hour"]:
            raise HTTPException(status_code=429, detail=f"Rate limit: max {lim['ip_per_hour']} runs/hour per IP.")
        if len(_GLOBAL) >= lim["global_per_min"]:
            raise HTTPException(status_code=429, detail=f"Rate limit: server busy ({lim['global_per_min']} runs/min cap).")

        sess.append(now)
        ipb.append(now)
        _GLOBAL.append(now)


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


def _client_ip(request: Request) -> str:
    """Resolve the originating IP, honouring X-Forwarded-For when present.

    Render / most reverse proxies set X-Forwarded-For with the real client
    IP as the first comma-separated entry.
    """
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


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
    lim = _limits()
    return {
        "enabled":             _enabled(),
        "max_timeout_s":       MAX_TIMEOUT_S,
        "max_code_bytes":      MAX_CODE_BYTES,
        "rate_limit_per_min":  lim["per_min"],
        "rate_limit_per_hour": lim["per_hour"],
        "ip_per_min":          lim["ip_per_min"],
        "ip_per_hour":         lim["ip_per_hour"],
        "global_per_min":      lim["global_per_min"],
        "max_concurrent":      lim["max_concurrent"],
    }


@router.post("/run", response_model=CodeRunResponse)
def code_runner_run(req: CodeRunRequest, request: Request) -> CodeRunResponse:
    if not _enabled():
        raise HTTPException(status_code=503, detail="Code execution is disabled on this server. Set ENABLE_CODE_RUNNER=1 to enable.")

    lim = _limits()
    ip = _client_ip(request)
    _check_rate(req.session_id, ip, lim)

    df = store.get_filtered(req.session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")

    # Concurrency limit — bail fast with 429 if at cap
    sem = _get_semaphore(lim["max_concurrent"])
    if not sem.acquire(blocking=False):
        raise HTTPException(status_code=429, detail=f"Server busy: max {lim['max_concurrent']} concurrent code runs.")

    try:
        code_hash = hashlib.sha256(req.code.encode("utf-8")).hexdigest()[:16]
        code_preview = req.code[:200].replace("\n", "\\n")
        started = time.time()

        res = run_python(req.code, df=df, timeout=req.timeout)
    finally:
        sem.release()

    timed_out = bool(res.error and "timeout" in res.error.lower())

    _audit({
        "ts":            round(started, 3),
        "session_id":    req.session_id,
        "ip":            ip,
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
