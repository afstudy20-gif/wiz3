"""In-memory dataframe store keyed by session id."""
import pandas as pd
from typing import Dict, Optional

_store: Dict[str, pd.DataFrame] = {}


def save(session_id: str, df: pd.DataFrame) -> None:
    _store[session_id] = df


def get(session_id: str) -> Optional[pd.DataFrame]:
    return _store.get(session_id)


def delete(session_id: str) -> None:
    _store.pop(session_id, None)


def list_sessions() -> list[str]:
    return list(_store.keys())
