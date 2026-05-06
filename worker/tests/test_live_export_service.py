from __future__ import annotations

from typing import Any, Dict, Optional

import io
import json
import zipfile

from worker.app.config import Settings
from worker.app.infra.runtime_store import RuntimeStore
from worker.app.services.corpus_service import CorpusService
from worker.app.services.live_export_service import GraphClient, LiveExportConfig, LiveExportService


def build_service(tmp_path) -> LiveExportService:
    settings = Settings(
        WORKER_MODE="local",
        WORKER_RUNTIME_DATA_DIR=tmp_path / "data" / "runtime",
    )
    runtime_store = RuntimeStore(settings.runtime_data_dir)
    corpus_service = CorpusService(settings=settings)
    return LiveExportService(settings=settings, runtime_store=runtime_store, corpus_service=corpus_service)


def test_graph_client_follows_download_redirects(monkeypatch) -> None:
    captured: Dict[str, object] = {}

    class FakeResponse:
        status_code = 200
        text = "downloaded text"
        content = b"downloaded bytes"
        headers = {"content-type": "application/octet-stream"}

        @staticmethod
        def json() -> dict[str, object]:
            return {}

    class FakeHttpClient:
        def __init__(self, *, timeout: int, follow_redirects: bool) -> None:
            captured["timeout"] = timeout
            captured["follow_redirects"] = follow_redirects

        def request(self, method: str, url: str, headers: dict[str, str]) -> FakeResponse:
            captured["method"] = method
            captured["url"] = url
            captured["headers"] = headers
            return FakeResponse()

        def close(self) -> None:
            captured["closed"] = True

    monkeypatch.setattr("worker.app.services.live_export_service.httpx.Client", FakeHttpClient)

    client = GraphClient(base_url="https://graph.microsoft.com/v1.0", access_token="token", timeout_seconds=17)
    content, content_type = client.get_bytes("/drives/drive-1/items/item-1/content")
    client.close()

    assert captured["follow_redirects"] is True
    assert captured["timeout"] == 17
    assert captured["url"] == "https://graph.microsoft.com/v1.0/drives/drive-1/items/item-1/content"
    assert captured["headers"] == {"Authorization": "Bearer token"}
    assert content == b"downloaded bytes"
    assert content_type == "application/octet-stream"
    assert captured["closed"] is True


def test_live_export_service_runs_graph_export_and_publishes_artifacts(tmp_path, monkeypatch) -> None:
    service = build_service(tmp_path)
    progress: list[tuple[str, int, str]] = []

    monkeypatch.setattr(service, "acquire_graph_access_token", lambda config, report_text=None: "test-token")

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

    published = json.loads(service._runtime_store.live_corpus_path().read_text(encoding="utf-8"))
    checkpoint = json.loads(service._runtime_store.live_export_checkpoint_path().read_text(encoding="utf-8"))
    sync_state = json.loads(service._runtime_store.sync_state_path("live").read_text(encoding="utf-8"))

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
    service._runtime_store.live_export_checkpoint_path().parent.mkdir(parents=True, exist_ok=True)
    service._runtime_store.live_export_checkpoint_path().write_text(json.dumps(checkpoint_payload), encoding="utf-8")

    monkeypatch.setattr(service, "acquire_graph_access_token", lambda config, report_text=None: "test-token")

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

    published = json.loads(service._runtime_store.live_corpus_path().read_text(encoding="utf-8"))

    assert observed["updated_after"] == "2026-04-17T10:00:00Z"
    assert result["sourceKind"] == "graph-resume"
    assert result["resumedFromCheckpoint"] is True
    assert result["skippedDocuments"] == 3
    assert [document["id"] for document in published["documents"]] == ["doc-keep"]


def test_live_export_service_normalizes_file_type(tmp_path) -> None:
    service = build_service(tmp_path)

    assert service._infer_file_type("policy.docx", "") == "document"
    assert service._infer_file_type("deck.pptx", "") == "presentation"
    assert service._infer_file_type("ledger.csv", "") == "spreadsheet"
    assert service._infer_file_type("notes", "text/plain") == "text"


def test_live_export_service_writes_extract_artifact_for_text_document(tmp_path) -> None:
    service = build_service(tmp_path)

    class FakeClient:
        def list_all(self, *_args: Any, **_kwargs: Any) -> list[dict[str, Any]]:
            return [
                {
                    "id": "item-1",
                    "name": "Roadmap.md",
                    "file": {"mimeType": "text/markdown"},
                    "size": 128,
                    "lastModifiedDateTime": "2026-04-18T12:00:00Z",
                    "createdBy": {"user": {"displayName": "Alice"}},
                    "lastModifiedBy": {"user": {"displayName": "Bob"}},
                    "webUrl": "https://tenant.sharepoint.com/Roadmap.md",
                }
            ]

        def get_text(self, path: str) -> tuple[str, str]:
            assert path.endswith("/content?format=html")
            return "# Roadmap\n\nLaunch body text.", "text/markdown"

    result = service._crawl_drive_items(
        FakeClient(),  # type: ignore[arg-type]
        site_id="tenant,site,abc",
        site_url="https://tenant.sharepoint.com/sites/A",
        site_name="Pilot Site A",
        drive={"id": "drive-1", "name": "Shared Documents"},
        root_path="",
        updated_after=None,
        report_text=lambda *_: None,
        check_cancelled=lambda: None,
    )

    document = result["documents"][0]
    extract_path = service._runtime_store.runtime_dir / document["extractPath"]
    extract = json.loads(extract_path.read_text(encoding="utf-8"))

    assert document["extractionStatus"] == "full_text"
    assert document["extractionReason"] == ""
    assert document["extractPath"].startswith("extracts/tenant-site-abc/")
    assert document["content"] == "# Roadmap Launch body text."
    assert extract["sourceId"] == document["id"]
    assert extract["sourceType"] == "document"
    assert extract["siteUrl"] == "https://tenant.sharepoint.com/sites/A"
    assert extract["libraryPath"] == "/Shared Documents/Roadmap.md"
    assert extract["lastModifiedBy"] == "Bob"
    assert extract["extractionStatus"] == "full_text"
    assert extract["text"] == "# Roadmap Launch body text."


def make_ooxml_fixture(path: str, xml: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types />")
        archive.writestr(path, xml)
    return buffer.getvalue()


def test_live_export_service_writes_extract_artifact_for_docx_document(tmp_path) -> None:
    service = build_service(tmp_path)
    docx_bytes = make_ooxml_fixture(
        "word/document.xml",
        "<w:document><w:body><w:p><w:r><w:t>Real DOCX body text</w:t></w:r></w:p></w:body></w:document>",
    )

    class FakeClient:
        def list_all(self, *_args: Any, **_kwargs: Any) -> list[dict[str, Any]]:
            return [
                {
                    "id": "item-2",
                    "name": "Policy.docx",
                    "file": {"mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
                    "size": len(docx_bytes),
                    "lastModifiedDateTime": "2026-04-18T12:00:00Z",
                }
            ]

        def get_bytes(self, path: str) -> tuple[bytes, str]:
            assert path.endswith("/content")
            return docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    result = service._crawl_drive_items(
        FakeClient(),  # type: ignore[arg-type]
        site_id="site-1",
        site_url="https://tenant.sharepoint.com/sites/A",
        site_name="Pilot Site A",
        drive={"id": "drive-1", "name": "Shared Documents"},
        root_path="",
        updated_after=None,
        report_text=lambda *_: None,
        check_cancelled=lambda: None,
    )

    document = result["documents"][0]
    extract = json.loads((service._runtime_store.runtime_dir / document["extractPath"]).read_text(encoding="utf-8"))

    assert document["fileType"] == "document"
    assert document["extractionStatus"] == "full_text"
    assert document["extractionReason"] == ""
    assert document["content"] == "Real DOCX body text"
    assert extract["extractionStatus"] == "full_text"
    assert extract["text"] == "Real DOCX body text"


def test_live_export_service_classifies_unsupported_extract_as_metadata_only(tmp_path) -> None:
    service = build_service(tmp_path)

    class FakeClient:
        def list_all(self, *_args: Any, **_kwargs: Any) -> list[dict[str, Any]]:
            return [
                {
                    "id": "item-unsupported",
                    "name": "Image.png",
                    "file": {"mimeType": "image/png"},
                    "size": 512,
                    "lastModifiedDateTime": "2026-04-18T12:00:00Z",
                }
            ]

        def get_bytes(self, _path: str) -> tuple[bytes, str]:
            raise AssertionError("unsupported images should not be downloaded")

    result = service._crawl_drive_items(
        FakeClient(),  # type: ignore[arg-type]
        site_id="site-1",
        site_url="https://tenant.sharepoint.com/sites/A",
        site_name="Pilot Site A",
        drive={"id": "drive-1", "name": "Shared Documents"},
        root_path="",
        updated_after=None,
        report_text=lambda *_: None,
        check_cancelled=lambda: None,
    )

    document = result["documents"][0]
    extract = json.loads((service._runtime_store.runtime_dir / document["extractPath"]).read_text(encoding="utf-8"))

    assert document["fileType"] == "png"
    assert document["extractionStatus"] == "metadata_only"
    assert document["extractionReason"] == "unsupported_file_type"
    assert extract["extractionStatus"] == "metadata_only"
    assert extract["text"] == ""


def test_live_export_service_classifies_empty_text_download_as_unreadable(tmp_path) -> None:
    service = build_service(tmp_path)

    class FakeClient:
        def list_all(self, *_args: Any, **_kwargs: Any) -> list[dict[str, Any]]:
            return [
                {
                    "id": "item-3",
                    "name": "Empty.txt",
                    "file": {"mimeType": "text/plain"},
                    "size": 16,
                    "lastModifiedDateTime": "2026-04-18T12:00:00Z",
                }
            ]

        def get_text(self, _path: str) -> tuple[str, str]:
            return "", "text/plain"

    result = service._crawl_drive_items(
        FakeClient(),  # type: ignore[arg-type]
        site_id="site-1",
        site_url="https://tenant.sharepoint.com/sites/A",
        site_name="Pilot Site A",
        drive={"id": "drive-1", "name": "Shared Documents"},
        root_path="",
        updated_after=None,
        report_text=lambda *_: None,
        check_cancelled=lambda: None,
    )

    document = result["documents"][0]
    extract = json.loads((service._runtime_store.runtime_dir / document["extractPath"]).read_text(encoding="utf-8"))

    assert document["extractionStatus"] == "unreadable"
    assert document["extractionReason"] == "text_download_empty"
    assert extract["extractionStatus"] == "unreadable"
    assert extract["text"] == ""


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
