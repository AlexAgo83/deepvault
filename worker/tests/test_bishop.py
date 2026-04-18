from __future__ import annotations

from fastapi.testclient import TestClient

from worker.main import app


client = TestClient(app)


def test_bishop_query_returns_grounded_answer() -> None:
    response = client.post("/api/bishop/query", json={"question": "What is the budget for Q3 2025?", "role": "analyst"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "answered"
    assert payload["answer"]
    assert payload["sources"]
    assert payload["trace"]["mode"] == "grounded-only"


def test_bishop_query_handles_no_answer() -> None:
    response = client.post("/api/bishop/query", json={"question": "What SharePoint sites are available?", "role": "analyst"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "no_answer"
    assert payload["sources"] == []
