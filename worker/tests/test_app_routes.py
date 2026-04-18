from __future__ import annotations

from fastapi.testclient import TestClient

from worker.main import app


client = TestClient(app)


def test_health_route_returns_foundation_payload() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["mode"] == "local"
    assert payload["workerVersion"]
    assert payload["timestamp"].endswith("Z")


def test_config_mode_route_returns_runtime_projection() -> None:
    response = client.get("/api/config/mode")

    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "local"
    assert payload["workerVersion"]
    assert payload["corpusVersion"] is None
    assert payload["isOperator"] is False
    assert payload["features"] == {"authEnabled": False}
    assert payload["timestamp"].endswith("Z")
