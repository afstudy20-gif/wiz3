import pytest
import pandas as pd
from fastapi.testclient import TestClient
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from main import app
from services import store


@pytest.fixture
def client():
    return TestClient(app)


def make_session(df: pd.DataFrame, session_id: str = "test_session") -> str:
    store.save(session_id, df)
    return session_id
