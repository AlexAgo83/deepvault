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
    assert payload["auth"] == {"enabled": False, "tenantId": None, "clientId": None, "scope": None}
    assert payload["timestamp"].endswith("Z")


def test_corpus_route_returns_mock_corpus_with_etag() -> None:
    response = client.get("/api/corpus")

    assert response.status_code == 200
    assert response.headers["etag"]
    payload = response.json()
    assert payload["schemaVersion"] == "1.1"
    assert isinstance(payload["documents"], list)


def test_corpus_route_honors_if_none_match() -> None:
    first = client.get("/api/corpus")
    response = client.get("/api/corpus", headers={"If-None-Match": first.headers["etag"]})

    assert response.status_code == 304
    assert response.headers["etag"] == first.headers["etag"]
