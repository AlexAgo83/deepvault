from __future__ import annotations

from typing import Dict, Optional

import httpx
from fastapi.testclient import TestClient

from worker.app.config import Settings
from worker.app.services.bishop_service import BishopService
from worker.app.services.corpus_service import CorpusService
from worker.main import app


client = TestClient(app)


class FakeResponse:
    def __init__(self, *, status_code: int, payload: Optional[dict] = None, text: str = "") -> None:
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self) -> dict:
        return self._payload


def build_service(**overrides: object) -> BishopService:
    settings = Settings(
        WORKER_MODE="local",
        **overrides,
    )
    return BishopService(settings=settings, corpus_service=CorpusService(settings=settings))


def test_bishop_query_returns_grounded_answer() -> None:
    response = client.post("/api/bishop/query", json={"question": "What is the budget for Q3 2025?", "role": "analyst"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "answered"
    assert payload["answer"]
    assert payload["sources"]
    assert payload["trace"]["mode"] == "fallback"


def test_bishop_query_handles_no_answer() -> None:
    response = client.post("/api/bishop/query", json={"question": "What SharePoint sites are available?", "role": "analyst"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "no_answer"
    assert payload["sources"] == []


def test_bishop_source_snippet_hides_metadata_only_placeholder() -> None:
    service = build_service()
    document = {
        "id": "doc-1",
        "title": "Metadata Only Policy",
        "siteId": "site-1",
        "path": "/Policies/Metadata Only Policy.docx",
        "updatedAt": "2026-04-18T12:00:00Z",
        "author": "Pilot Site A",
        "summary": "Body text is unavailable for this source.",
        "directAnswer": "Source: Metadata Only Policy.docx. Path: /Policies/Metadata Only Policy.docx.",
        "content": "Source: Metadata Only Policy.docx. Path: /Policies/Metadata Only Policy.docx.",
        "tags": ["metadata", "policy"],
        "access": ["analyst"],
        "source": "SharePoint",
        "extractionStatus": "metadata_only",
        "extractionReason": "unsupported_file_type",
    }

    source = service._build_source(document, 1.0, {"sites": [{"id": "site-1", "name": "Pilot Site A"}]}, query="policy")

    assert source["snippet"] == "Body text is unavailable for this source."
    assert not source["snippet"].startswith("Source:")
    assert source["extractionStatus"] == "metadata_only"
    assert source["extractionReason"] == "unsupported_file_type"


def test_bishop_service_uses_openai_provider_when_configured(monkeypatch) -> None:
    service = build_service(OPENAI_API_KEY="test-openai-key", BISHOP_MODEL="gpt-test-model")

    captured: Dict[str, object] = {}

    def fake_post(url: str, *, headers: dict[str, str], json: dict, timeout: float) -> FakeResponse:
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        return FakeResponse(
            status_code=200,
            payload={
                "choices": [{"message": {"content": "OpenAI remote answer."}}],
                "usage": {
                    "prompt_tokens": 111,
                    "completion_tokens": 22,
                },
            },
        )

    monkeypatch.setattr("worker.app.services.bishop_service.httpx.post", fake_post)

    payload = service.query(
        query="What is the budget for Q3 2025?",
        role="analyst",
        provider="openai",
        history=[
            {"role": "user", "text": "What did we discuss earlier?"},
            {"role": "assistant", "text": "We talked about the budget."},
        ],
    )

    assert captured["url"] == "https://api.openai.com/v1/chat/completions"
    assert captured["headers"] == {
        "authorization": "Bearer test-openai-key",
        "content-type": "application/json",
    }
    request_body = captured["json"]
    assert request_body["model"] == "gpt-test-model"
    assert request_body["temperature"] == 0
    assert request_body["messages"][0]["content"].startswith("You are Bishop, a grounded assistant.")
    assert "Conversation history:" in request_body["messages"][1]["content"]
    assert "- You: What did we discuss earlier?" in request_body["messages"][1]["content"]
    assert "- Bishop: We talked about the budget." in request_body["messages"][1]["content"]

    assert payload["trace"]["mode"] == "remote"
    assert payload["provider"] == "openai"
    assert payload["model"] == "gpt-test-model"
    assert payload["answer"] == "OpenAI remote answer."
    assert payload["usageKind"] == "provider"
    assert payload["inputTokenCount"] == 111
    assert payload["outputTokenCount"] == 22
    assert payload["tokenCount"] == 133
    assert payload["trace"]["providerTracePreview"].startswith("openai response:")


def test_bishop_service_uses_gemini_provider_when_configured(monkeypatch) -> None:
    service = build_service(GEMINI_API_KEY="test-gemini-key", BISHOP_MODEL="gemini-test-model")

    captured: Dict[str, object] = {}

    def fake_post(url: str, *, headers: dict[str, str], json: dict, timeout: float) -> FakeResponse:
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return FakeResponse(
            status_code=200,
            payload={
                "candidates": [{"content": {"parts": [{"text": "Gemini remote answer."}]}}],
                "usageMetadata": {
                    "promptTokenCount": 88,
                    "candidatesTokenCount": 34,
                },
            },
        )

    monkeypatch.setattr("worker.app.services.bishop_service.httpx.post", fake_post)

    payload = service.query(query="Export the Q3 2025 budget answer as csv", role="analyst", provider="gemini")

    assert captured["url"] == "https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent"
    assert captured["headers"] == {
        "content-type": "application/json",
        "x-goog-api-key": "test-gemini-key",
    }
    request_body = captured["json"]
    assert request_body["generationConfig"] == {"temperature": 0, "maxOutputTokens": 512}
    assert request_body["contents"][0]["parts"][0]["text"].startswith("You are Bishop, a grounded assistant.")
    assert payload["trace"]["mode"] == "remote"
    assert payload["answer"] == "Gemini remote answer."
    assert payload["tokenCount"] == 122
    assert payload["usageKind"] == "provider"


def test_bishop_service_uses_anthropic_provider_when_configured(monkeypatch) -> None:
    service = build_service(ANTHROPIC_API_KEY="test-anthropic-key", BISHOP_MODEL="claude-test-model")

    captured: Dict[str, object] = {}

    def fake_post(url: str, *, headers: dict[str, str], json: dict, timeout: float) -> FakeResponse:
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return FakeResponse(
            status_code=200,
            payload={
                "content": [{"type": "text", "text": "Claude remote answer."}],
                "usage": {
                    "input_tokens": 123,
                    "output_tokens": 45,
                },
            },
        )

    monkeypatch.setattr("worker.app.services.bishop_service.httpx.post", fake_post)

    payload = service.query(query="What is the budget for Q3 2025?", role="analyst", provider="anthropic")

    assert captured["url"] == "https://api.anthropic.com/v1/messages"
    assert captured["headers"] == {
        "content-type": "application/json",
        "x-api-key": "test-anthropic-key",
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
    }
    request_body = captured["json"]
    assert request_body["model"] == "claude-test-model"
    assert request_body["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert request_body["messages"][0]["content"][1]["cache_control"] == {"type": "ephemeral"}
    assert payload["trace"]["mode"] == "remote"
    assert payload["answer"] == "Claude remote answer."
    assert payload["tokenCount"] == 168
    assert payload["usageKind"] == "provider"


def test_bishop_service_falls_back_when_provider_key_is_missing() -> None:
    service = build_service()

    payload = service.query(query="What is the budget for Q3 2025?", role="analyst", provider="anthropic")

    assert payload["trace"]["mode"] == "fallback"
    assert payload["usageKind"] == "local"
    assert payload["answer"]
    assert payload["trace"]["providerTracePreview"] == "anthropic error: Anthropic API key missing"


def test_bishop_service_falls_back_when_provider_request_fails(monkeypatch) -> None:
    service = build_service(OPENAI_API_KEY="test-openai-key")

    def fake_post(url: str, *, headers: dict[str, str], json: dict, timeout: float) -> FakeResponse:
        return FakeResponse(status_code=500, text="upstream unavailable")

    monkeypatch.setattr("worker.app.services.bishop_service.httpx.post", fake_post)

    payload = service.query(query="What is the budget for Q3 2025?", role="analyst", provider="openai")

    assert payload["trace"]["mode"] == "fallback"
    assert payload["usageKind"] == "local"
    assert payload["answer"]
    assert "HTTP 500: upstream unavailable" in payload["trace"]["providerTracePreview"]


def test_bishop_service_falls_back_when_provider_transport_raises(monkeypatch) -> None:
    service = build_service(GEMINI_API_KEY="test-gemini-key")

    def fake_post(url: str, *, headers: dict[str, str], json: dict, timeout: float) -> FakeResponse:
        raise httpx.HTTPError("network down")

    monkeypatch.setattr("worker.app.services.bishop_service.httpx.post", fake_post)

    payload = service.query(query="What is the budget for Q3 2025?", role="analyst", provider="gemini")

    assert payload["trace"]["mode"] == "fallback"
    assert payload["usageKind"] == "local"
    assert payload["answer"]
    assert payload["trace"]["providerTracePreview"] == "gemini error: Gemini request failed"
