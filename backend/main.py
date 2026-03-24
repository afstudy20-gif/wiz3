import os
import psutil
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import upload, stats, charts, models, session, compute
from services import store

app = FastAPI(title="Wizard Stats API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # allow all localhost ports
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
app.include_router(stats.router, prefix="/api/stats", tags=["stats"])
app.include_router(charts.router, prefix="/api/charts", tags=["charts"])
app.include_router(models.router, prefix="/api/models", tags=["models"])
app.include_router(session.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(compute.router, prefix="/api/compute", tags=["compute"])


@app.get("/api/health")
def health():
    """Health check with memory usage stats."""
    process = psutil.Process()
    mem_info = process.memory_info()
    mem_percent = process.memory_percent()

    # Calculate dataframe memory usage
    df_memory_mb = 0
    session_count = len(store.list_sessions())
    for sid in store.list_sessions():
        df = store.get(sid)
        if df is not None:
            df_memory_mb += df.memory_usage(deep=True).sum() / (1024 * 1024)

    return {
        "status": "ok",
        "memory": {
            "process_rss_mb": mem_info.rss / (1024 * 1024),
            "process_percent": mem_percent,
            "dataframe_memory_mb": round(df_memory_mb, 2),
            "active_sessions": session_count,
        }
    }


# Serve compiled React frontend (production build).
# Must come AFTER all /api routes so API routes are matched first.
_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(_dist):
    app.mount("/", StaticFiles(directory=_dist, html=True), name="static")
