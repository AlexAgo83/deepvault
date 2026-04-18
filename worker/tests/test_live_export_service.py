from __future__ import annotations

from typing import Dict, Optional

import json

from worker.app.config import Settings
from worker.app.infra.runtime_store import RuntimeStore
from worker.app.services.corpus_service import CorpusService
from worker.app.services.live_export_service import LiveExportConfig, LiveExportService


def build_service(tmp_path) -> LiveExportService:
    settings = Settings(
        WORKER_MODE="local",
        WORKER_RUNTIME_DATA_DIR=tmp_path,
    )
    runtime_store = RuntimeStore(settings.runtime_data_dir)
    corpus_service = CorpusService(settings=settings)
    return LiveExportService(settings=settings, runtime_store=runtime_store, corpus_service=corpus_service)


def test_live_export_service_runs_graph_export_and_publishes_artifacts(tmp_path, monkeypatch) -> None:
    service = build_service(tmp_path)
    progress: list[tuple[str, int, str]] = []

    monkeypatch.setattr(service, "acquire_graph_access_token", lambda config: "test-token")

    def fake_export_site_corpus(*args, **kwargs):
        return {
            "site": {
                "id": "site-1",
                "name": "Pilot Site A",
                "url": "https://tenant.sharepoint.com/sites/A",
                "libraryCount": 2,
                "listCount": 1,
                "status": "synced",
                "access": ["analyst", "admin"],
                "owner": "Pilot Site A",
            },
            "documents": [
                {
                    "id": "doc-1",
                    "siteId": "site-1",
                    "kind": "md",
                    "title": "Roadmap",
                    "path": "/Shared Documents/Roadmap.md",
                    "updatedAt": "2026-04-18T12:00:00Z",
                    "summary": "Roadmap summary.",
                    "directAnswer": "Roadmap summary.",
                    "content": "Roadmap summary.",
                    "tags": ["roadmap"],
                    "access": ["analyst", "admin"],
                    "source": "SharePoint",
                }
            ],
            "currentDocumentIds": ["doc-1"],
            "driveCount": 2,
            "listCount": 1,
            "skippedDocuments": 0,
        }

    monkeypatch.setattr(service, "_export_site_corpus", fake_export_site_corpus)

    result = service.run_export(
        env={
            "DEEPVAULT_DATA_MODE": "live",
            "DEEPVAULT_ENTRA_AUTH_MODE": "application",
            "DEEPVAULT_ENTRA_APP_ID": "app-id",
            "DEEPVAULT_ENTRA_TENANT_ID": "tenant-id",
            "DEEPVAULT_ENTRA_SECRET_VALUE": "secret",
            "DEEPVAULT_ENTRA_SITES": "https://tenant.sharepoint.com/sites/A",
            "DEEPVAULT_PILOT_SITE_NAMES": "Pilot Site A",
        },
        report_progress=lambda step, pct, message: progress.append((step, pct, message)),
        check_cancelled=lambda: None,
    )

    published = json.loads((tmp_path.parent.parent / "public" / "live-corpus.json").read_text(encoding="utf-8"))
    checkpoint = json.loads((tmp_path / "live-export-checkpoint.json").read_text(encoding="utf-8"))
    sync_state = json.loads((tmp_path / "sync-state.live.json").read_text(encoding="utf-8"))

    assert result["sourceKind"] == "graph-full"
    assert result["documentCount"] == 1
    assert result["siteCount"] == 1
    assert published["documents"][0]["id"] == "doc-1"
    assert checkpoint["syncedAt"]
    assert sync_state["mode"] == "live"
    assert any(step == "auth" for step, _, _ in progress)


def test_live_export_service_resume_uses_checkpoint_timestamp_and_reconciles_documents(tmp_path, monkeypatch) -> None:
    service = build_service(tmp_path)
    checkpoint_payload = {
        "schemaVersion": "1.1",
        "defaultUserRole": "analyst",
        "providers": [],
        "sites": [
            {
                "id": "site-1",
                "name": "Pilot Site A",
                "url": "https://tenant.sharepoint.com/sites/A",
                "libraryCount": 1,
                "listCount": 1,
                "status": "synced",
                "access": ["analyst", "admin"],
                "owner": "Pilot Site A",
            }
        ],
        "syncedAt": "2026-04-17T10:00:00Z",
        "syncRuns": [
            {
                "id": "sync-2026-04-17-live",
                "startedAt": "2026-04-17T09:30:00Z",
                "finishedAt": "2026-04-17T10:00:00Z",
                "scope": "SharePoint live export from 1 configured site(s)",
                "status": "synced",
                "siteIds": ["site-1"],
                "documentsSynced": 2,
                "chunksWritten": 12,
                "notes": "Checkpointed 2 documents.",
            }
        ],
        "documents": [
            {
                "id": "doc-keep",
                "siteId": "site-1",
                "kind": "md",
                "title": "Keep",
                "path": "/Shared Documents/Keep.md",
                "updatedAt": "2026-04-17T09:00:00Z",
                "summary": "Keep summary.",
                "directAnswer": "Keep summary.",
                "content": "Keep summary.",
                "tags": ["keep"],
                "access": ["analyst", "admin"],
                "source": "SharePoint",
            },
            {
                "id": "doc-remove",
                "siteId": "site-1",
                "kind": "md",
                "title": "Remove",
                "path": "/Shared Documents/Remove.md",
                "updatedAt": "2026-04-17T09:00:00Z",
                "summary": "Remove summary.",
                "directAnswer": "Remove summary.",
                "content": "Remove summary.",
                "tags": ["remove"],
                "access": ["analyst", "admin"],
                "source": "SharePoint",
            },
        ],
    }
    (tmp_path / "live-export-checkpoint.json").write_text(json.dumps(checkpoint_payload), encoding="utf-8")

    monkeypatch.setattr(service, "acquire_graph_access_token", lambda config: "test-token")

    observed: Dict[str, Optional[str]] = {}

    def fake_export_site_corpus(*args, **kwargs):
        observed["updated_after"] = kwargs["updated_after"]
        return {
            "site": checkpoint_payload["sites"][0],
            "documents": [
                {
                    "id": "doc-keep",
                    "siteId": "site-1",
                    "kind": "md",
                    "title": "Keep",
                    "path": "/Shared Documents/Keep.md",
                    "updatedAt": "2026-04-18T12:00:00Z",
                    "summary": "Keep summary updated.",
                    "directAnswer": "Keep summary updated.",
                    "content": "Keep summary updated.",
                    "tags": ["keep"],
                    "access": ["analyst", "admin"],
                    "source": "SharePoint",
                }
            ],
            "currentDocumentIds": ["doc-keep"],
            "driveCount": 1,
            "listCount": 1,
            "skippedDocuments": 3,
        }

    monkeypatch.setattr(service, "_export_site_corpus", fake_export_site_corpus)

    result = service.run_export(
        env={
            "DEEPVAULT_DATA_MODE": "live",
            "DEEPVAULT_EXPORT_LIVE_RESUME": "1",
            "DEEPVAULT_ENTRA_AUTH_MODE": "application",
            "DEEPVAULT_ENTRA_APP_ID": "app-id",
            "DEEPVAULT_ENTRA_TENANT_ID": "tenant-id",
            "DEEPVAULT_ENTRA_SECRET_VALUE": "secret",
            "DEEPVAULT_ENTRA_SITES": "https://tenant.sharepoint.com/sites/A",
            "DEEPVAULT_PILOT_SITE_NAMES": "Pilot Site A",
        },
        report_progress=lambda *_: None,
        check_cancelled=lambda: None,
    )

    published = json.loads((tmp_path.parent.parent / "public" / "live-corpus.json").read_text(encoding="utf-8"))

    assert observed["updated_after"] == "2026-04-17T10:00:00Z"
    assert result["sourceKind"] == "graph-resume"
    assert result["resumedFromCheckpoint"] is True
    assert result["skippedDocuments"] == 3
    assert [document["id"] for document in published["documents"]] == ["doc-keep"]


def test_live_export_service_client_credentials_auth_posts_expected_form(monkeypatch, tmp_path) -> None:
    service = build_service(tmp_path)
    captured: Dict[str, object] = {}

    class FakeResponse:
        status_code = 200
        text = ""

        @staticmethod
        def json() -> dict[str, str]:
            return {"access_token": "graph-token"}

    def fake_post(url: str, *, data: dict[str, str], timeout: int, headers: dict[str, str]):
        captured["url"] = url
        captured["data"] = data
        captured["timeout"] = timeout
        captured["headers"] = headers
        return FakeResponse()

    monkeypatch.setattr("worker.app.services.live_export_service.httpx.post", fake_post)

    token = service.acquire_graph_access_token(
        LiveExportConfig(
            auth_mode="application",
            base_url="https://graph.microsoft.com/v1.0",
            timeout_seconds=30,
            scopes=["Sites.Read.All"],
            site_urls=["https://tenant.sharepoint.com/sites/A"],
            site_names=["Pilot Site A"],
            app_id="app-id",
            tenant_id="tenant-id",
            secret_value="secret",
        )
    )

    assert token == "graph-token"
    assert captured["url"] == "https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token"
    assert captured["data"] == {
        "client_id": "app-id",
        "client_secret": "secret",
        "grant_type": "client_credentials",
        "scope": "https://graph.microsoft.com/.default",
    }
