from __future__ import annotations

import hashlib
import html
import json
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import quote, urlparse

import httpx

from worker.app.config import Settings
from worker.app.infra.runtime_store import RuntimeStore
from worker.app.infra.time import utc_now_iso
from worker.app.services.corpus_service import CorpusService


TEXTUAL_MIME_PREFIXES = ("text/", "application/json", "application/xml", "application/xhtml+xml")
TEXTUAL_EXTENSIONS = {"txt", "md", "markdown", "csv", "tsv", "json", "xml", "html", "htm", "aspx"}
MAX_TEXT_DOWNLOAD_BYTES = 256 * 1024


@dataclass
class LiveExportConfig:
    auth_mode: str
    base_url: str
    timeout_seconds: int
    scopes: List[str]
    site_urls: List[str]
    site_names: List[str]
    app_id: str
    tenant_id: str
    secret_value: str


class GraphClient:
    def __init__(self, *, base_url: str, access_token: str, timeout_seconds: int) -> None:
        self._base_url = base_url.rstrip("/")
        self._access_token = access_token
        self._timeout_seconds = timeout_seconds
        self._client = httpx.Client(timeout=timeout_seconds)

    def close(self) -> None:
        self._client.close()

    def _resolve_url(self, path_or_url: str) -> str:
        if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
            return path_or_url
        return f"{self._base_url}{path_or_url}"

    def _request(self, method: str, path_or_url: str, *, headers: Optional[Dict[str, str]] = None) -> httpx.Response:
        url = self._resolve_url(path_or_url)
        merged_headers = {"Authorization": f"Bearer {self._access_token}"}
        if headers:
            merged_headers.update(headers)

        for retry_count in range(4):
            response = self._client.request(method, url, headers=merged_headers)
            if response.status_code not in {429, 503, 504} or retry_count == 3:
                return response
            retry_after = max(1, int(response.headers.get("retry-after", "1")))
            time.sleep(retry_after)
        return response

    def get_json(self, path_or_url: str) -> Dict[str, Any]:
        response = self._request("GET", path_or_url)
        if response.status_code >= 400:
            raise RuntimeError(f"Graph request failed ({response.status_code}): {response.text}")
        return response.json()

    def get_text(self, path_or_url: str) -> Tuple[str, str]:
        response = self._request("GET", path_or_url)
        if response.status_code >= 400:
            raise RuntimeError(f"Graph content request failed ({response.status_code})")
        content_type = response.headers.get("content-type", "")
        return response.text, content_type

    def list_all(
        self,
        path_or_url: str,
        *,
        report_progress: Optional[Callable[[str], None]] = None,
        label: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        next_url = self._resolve_url(path_or_url)
        page_index = 0

        while next_url:
            page_index += 1
            page = self.get_json(next_url)
            values = page.get("value", [])
            if isinstance(values, list):
                items.extend([entry for entry in values if isinstance(entry, dict)])
            report_progress and report_progress(
                f"{label or 'Graph'} page {page_index}: fetched {len(values)} items (total {len(items)})"
            )
            next_url = page.get("@odata.nextLink") if isinstance(page.get("@odata.nextLink"), str) else ""

        return items


class LiveExportService:
    def __init__(
        self,
        *,
        settings: Settings,
        runtime_store: RuntimeStore,
        corpus_service: CorpusService,
    ) -> None:
        self._settings = settings
        self._runtime_store = runtime_store
        self._corpus_service = corpus_service

    def run_export(
        self,
        *,
        env: Optional[Dict[str, str]] = None,
        report_progress: Callable[[str, int, str], None],
        check_cancelled: Callable[[], None],
    ) -> Dict[str, Any]:
        merged_env = self._merge_env(env)
        mode = "live" if merged_env.get("DEEPVAULT_DATA_MODE") == "live" else "mock"
        input_path = merged_env.get("DEEPVAULT_CORPUS_PATH")

        if input_path:
            source_path = Path(input_path).expanduser().resolve()
            if not source_path.exists():
                raise FileNotFoundError(f"Export-live source not found at {source_path}.")
            corpus = json.loads(source_path.read_text(encoding="utf-8"))
            return self._publish_corpus(
                corpus=corpus,
                report_progress=report_progress,
                source_kind="explicit-input",
                source_path=source_path,
                mode=mode,
            )

        if mode != "live":
            source_path = self._corpus_service.resolve_job_corpus_path(mode="mock")
            corpus = self._corpus_service.load_job_corpus_payload(mode="mock")
            return self._publish_corpus(
                corpus=corpus,
                report_progress=report_progress,
                source_kind="mock-baseline",
                source_path=source_path,
                mode=mode,
            )

        return self._run_live_graph_export(
            merged_env=merged_env,
            report_progress=report_progress,
            check_cancelled=check_cancelled,
        )

    def _run_live_graph_export(
        self,
        *,
        merged_env: Dict[str, str],
        report_progress: Callable[[str, int, str], None],
        check_cancelled: Callable[[], None],
    ) -> Dict[str, Any]:
        config = self._build_config(merged_env)
        site_definitions = self._build_site_definitions(config)
        if not site_definitions:
            raise ValueError("DEEPVAULT_ENTRA_SITES must list at least one SharePoint site URL.")

        resume_requested = self._is_truthy(merged_env.get("DEEPVAULT_EXPORT_LIVE_RESUME"))
        checkpoint = self._read_checkpoint() if resume_requested else None
        seed_from_checkpoint, updated_after = self._resolve_resume_state(resume_requested, checkpoint)

        report_progress("auth", 10, f"Authenticating against Microsoft Graph ({config.auth_mode})...")
        access_token = self.acquire_graph_access_token(
            config,
            report_text=lambda msg: report_progress("auth", 10, msg),
        )
        client = GraphClient(base_url=config.base_url, access_token=access_token, timeout_seconds=config.timeout_seconds)

        started_at = utc_now_iso()
        sites = list(checkpoint.get("sites", [])) if seed_from_checkpoint and isinstance(checkpoint, dict) else []
        documents = list(checkpoint.get("documents", [])) if seed_from_checkpoint and isinstance(checkpoint, dict) else []
        checkpoint_sync_runs = checkpoint.get("syncRuns", []) if isinstance(checkpoint, dict) else []
        site_ids = list(checkpoint_sync_runs[0].get("siteIds", [])) if checkpoint_sync_runs else []
        total_libraries = sum(site.get("libraryCount", 0) for site in sites if isinstance(site, dict))
        total_lists = sum(site.get("listCount", 0) for site in sites if isinstance(site, dict))
        skipped_documents = 0
        ingested_documents = 0

        try:
            for index, definition in enumerate(site_definitions):
                check_cancelled()
                pct = 15 + round((index / max(len(site_definitions), 1)) * 65)
                sync_mode = f"delta from {updated_after}" if updated_after else "full sync"
                report_progress("export-site", pct, f"[{definition[1]}] Starting export ({sync_mode})")
                try:
                    exported = self._export_site_corpus(
                        client,
                        site_url=definition[0],
                        site_name=definition[1],
                        updated_after=updated_after,
                        report_text=lambda message, pct=pct: report_progress("export-site", pct, message),
                        check_cancelled=check_cancelled,
                    )
                    sites = self._upsert_site(sites, exported["site"])
                    documents = self._reconcile_site_documents(
                        documents,
                        exported["documents"],
                        exported["site"]["id"],
                        exported["currentDocumentIds"],
                    )
                    if exported["site"]["id"] not in site_ids:
                        site_ids.append(exported["site"]["id"])
                    total_libraries = sum(site.get("libraryCount", 0) for site in sites if isinstance(site, dict))
                    total_lists = sum(site.get("listCount", 0) for site in sites if isinstance(site, dict))
                    skipped_documents += exported["skippedDocuments"]
                    ingested_documents += len(exported["documents"])
                    report_progress(
                        "export-site",
                        min(85, pct + 8),
                        f"[{definition[1]}] Export finished with {len(exported['documents'])} documents ({exported['skippedDocuments']} skipped)",
                    )
                except Exception as exc:
                    fallback_site = {
                        "id": definition[0],
                        "name": definition[1],
                        "url": definition[0],
                        "libraryCount": 0,
                        "listCount": 0,
                        "status": "restricted",
                        "access": ["admin"],
                        "owner": definition[1],
                    }
                    sites = self._upsert_site(sites, fallback_site)
                    report_progress("export-site", min(85, pct + 8), f"Skipped {definition[0]}: {exc}")

                checkpoint_corpus = self._build_live_export_corpus(
                    config=config,
                    started_at=started_at,
                    synced_at=utc_now_iso(),
                    sites=sites,
                    documents=documents,
                    site_ids=site_ids,
                    total_libraries=total_libraries,
                    total_lists=total_lists,
                    notes=f"Checkpointed {len(documents)} documents from {total_libraries} libraries and {total_lists} lists.",
                    status="synced",
                    merged_env=merged_env,
                )
                self._runtime_store.write_json_artifact(self._runtime_store.live_export_checkpoint_path(), checkpoint_corpus)
        finally:
            client.close()

        source_kind = "graph-resume" if updated_after else "graph-full"
        corpus = self._build_live_export_corpus(
            config=config,
            started_at=started_at,
            synced_at=utc_now_iso(),
            sites=sites,
            documents=documents,
            site_ids=site_ids,
            total_libraries=total_libraries,
            total_lists=total_lists,
            notes=f"Exported {len(documents)} documents from {total_libraries} libraries and {total_lists} lists.",
            status="synced",
            merged_env=merged_env,
        )
        result = self._publish_corpus(
            corpus=corpus,
            report_progress=report_progress,
            source_kind=source_kind,
            source_path=Path(self._runtime_store.live_export_checkpoint_path()),
            mode="live",
        )
        result["skippedDocuments"] = skipped_documents
        result["ingestedDocuments"] = ingested_documents
        result["resumedFromCheckpoint"] = bool(updated_after)
        return result

    def _publish_corpus(
        self,
        *,
        corpus: Dict[str, Any],
        report_progress: Callable[[str, int, str], None],
        source_kind: str,
        source_path: Path,
        mode: str,
    ) -> Dict[str, Any]:
        report_progress("publish-live-corpus", 55, f"Publishing live corpus from {source_kind}...")
        live_corpus_path = self._runtime_store.live_corpus_path()
        self._runtime_store.write_json_artifact(live_corpus_path, corpus)

        synced_at = utc_now_iso()
        checkpoint_path = self._runtime_store.live_export_checkpoint_path()
        report_progress("write-checkpoint", 80, "Writing live export checkpoint...")
        checkpoint_payload = {**corpus, "syncedAt": synced_at}
        self._runtime_store.write_json_artifact(checkpoint_path, checkpoint_payload)

        report_progress("write-sync-state", 95, "Refreshing live sync snapshot...")
        sync_payload = self._build_sync_state_payload(corpus=corpus, mode=mode, corpus_path=live_corpus_path)
        sync_state_path = self._runtime_store.write_sync_state(sync_payload, mode="live")

        documents = corpus.get("documents", []) if isinstance(corpus.get("documents"), list) else []
        sites = corpus.get("sites", []) if isinstance(corpus.get("sites"), list) else []
        analyzed_count = sum(
            1
            for document in documents
            if isinstance(document, dict)
            and isinstance(document.get("analysis"), dict)
            and document["analysis"].get("status") == "analyzed"
        )
        return {
            "summary": (
                f"Export-live completed: published {len(documents)} documents to {live_corpus_path.name} "
                f"from {source_kind}."
            ),
            "mode": mode,
            "sourceKind": source_kind,
            "sourcePath": str(source_path),
            "outputPath": str(live_corpus_path),
            "checkpointPath": str(checkpoint_path),
            "syncStatePath": str(sync_state_path),
            "documentCount": len(documents),
            "siteCount": len(sites),
            "analyzedCount": analyzed_count,
        }

    def _build_config(self, env: Dict[str, str]) -> LiveExportConfig:
        return LiveExportConfig(
            auth_mode=(env.get("DEEPVAULT_ENTRA_AUTH_MODE") or "delegated").strip().lower(),
            base_url=env.get("DEEPVAULT_ENTRA_BASE_URL") or "https://graph.microsoft.com/v1.0",
            timeout_seconds=int(env.get("DEEPVAULT_ENTRA_TIMEOUT_SECONDS") or 30),
            scopes=self._parse_csv(env.get("DEEPVAULT_ENTRA_SCOPES") or "Sites.Read.All,User.Read,Files.Read.All"),
            site_urls=self._parse_csv(env.get("DEEPVAULT_ENTRA_SITES")),
            site_names=self._parse_csv(env.get("DEEPVAULT_PILOT_SITE_NAMES")),
            app_id=env.get("DEEPVAULT_ENTRA_APP_ID") or "",
            tenant_id=env.get("DEEPVAULT_ENTRA_TENANT_ID") or "",
            secret_value=env.get("DEEPVAULT_ENTRA_SECRET_VALUE") or "",
        )

    def acquire_graph_access_token(
        self,
        config: LiveExportConfig,
        report_text: Optional[Callable[[str], None]] = None,
    ) -> str:
        if not config.app_id or not config.tenant_id:
            raise ValueError("DEEPVAULT_ENTRA_APP_ID and DEEPVAULT_ENTRA_TENANT_ID are required.")

        if config.auth_mode in {"client_credentials", "application", "app_only"}:
            if not config.secret_value:
                raise ValueError("DEEPVAULT_ENTRA_SECRET_VALUE is required for application auth mode.")
            return self._acquire_client_credentials_token(config)

        try:
            return self._acquire_delegated_token(config, report_text=report_text)
        except RuntimeError as exc:
            if config.secret_value and "AADSTS7000218" in str(exc):
                return self._acquire_client_credentials_token(config)
            raise

    def _acquire_client_credentials_token(self, config: LiveExportConfig) -> str:
        base = f"https://login.microsoftonline.com/{config.tenant_id}/oauth2/v2.0"
        response = httpx.post(
            f"{base}/token",
            data={
                "client_id": config.app_id,
                "client_secret": config.secret_value,
                "grant_type": "client_credentials",
                "scope": "https://graph.microsoft.com/.default",
            },
            timeout=config.timeout_seconds,
            headers={"content-type": "application/x-www-form-urlencoded"},
        )
        if response.status_code >= 400:
            raise RuntimeError(f"Auth request failed ({response.status_code}): {response.text}")
        payload = response.json()
        access_token = payload.get("access_token")
        if not isinstance(access_token, str) or not access_token:
            raise RuntimeError("Auth response did not include an access token.")
        return access_token

    def _acquire_delegated_token(
        self,
        config: LiveExportConfig,
        report_text: Optional[Callable[[str], None]] = None,
    ) -> str:
        base = f"https://login.microsoftonline.com/{config.tenant_id}/oauth2/v2.0"
        device_code_response = httpx.post(
            f"{base}/devicecode",
            data={
                "client_id": config.app_id,
                "scope": " ".join(config.scopes),
            },
            timeout=config.timeout_seconds,
            headers={"content-type": "application/x-www-form-urlencoded"},
        )
        if device_code_response.status_code >= 400:
            raise RuntimeError(f"Auth request failed ({device_code_response.status_code}): {device_code_response.text}")
        payload = device_code_response.json()
        deadline = time.time() + int(payload.get("expires_in", 0))
        poll_interval = max(5, int(payload.get("interval", 5)))
        device_code = payload.get("device_code")
        if not isinstance(device_code, str) or not device_code:
            raise RuntimeError("Device code flow failed: device_code missing.")

        auth_message = payload.get("message", "")
        if auth_message:
            print(auth_message, flush=True)
            if report_text:
                report_text(auth_message)

        while time.time() < deadline:
            time.sleep(poll_interval)
            token_payload = {
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "client_id": config.app_id,
                "device_code": device_code,
            }
            if config.secret_value:
                token_payload["client_secret"] = config.secret_value
            token_response = httpx.post(
                f"{base}/token",
                data=token_payload,
                timeout=config.timeout_seconds,
                headers={"content-type": "application/x-www-form-urlencoded"},
            )
            token_json = token_response.json()
            access_token = token_json.get("access_token")
            if isinstance(access_token, str) and access_token:
                return access_token
            if token_json.get("error") == "authorization_pending":
                continue
            if token_json.get("error") == "slow_down":
                poll_interval *= 2
                continue
            raise RuntimeError(
                f"Device code flow failed: {token_json.get('error_description') or token_json.get('error') or 'unknown error'}"
            )

        raise RuntimeError("Device code flow expired before authorization completed.")

    def _export_site_corpus(
        self,
        client: GraphClient,
        *,
        site_url: str,
        site_name: str,
        updated_after: Optional[str],
        report_text: Callable[[str], None],
        check_cancelled: Callable[[], None],
    ) -> Dict[str, Any]:
        report_text(f"[{site_name}] Resolving site {site_url}")
        site = client.get_json(self._site_url_to_graph_path(site_url))
        report_text(f"[{site_name}] Site resolved as {site.get('displayName', site_name)}")
        drives = client.list_all(f"/sites/{site['id']}/drives?$top=100", report_progress=report_text, label=f"[{site_name}] drives")
        lists = client.list_all(f"/sites/{site['id']}/lists?$top=100", report_progress=report_text, label=f"[{site_name}] lists")
        report_text(f"[{site_name}] Found {len(drives)} libraries and {len(lists)} lists")

        documents: List[Dict[str, Any]] = []
        current_document_ids: List[str] = []
        skipped_documents = 0

        for drive in drives:
            check_cancelled()
            report_text(f"[{site_name}] Crawling library {drive.get('name', 'Unnamed')}")
            nested = self._crawl_drive_items(
                client,
                site_id=site["id"],
                site_name=site_name or site.get("displayName", ""),
                drive=drive,
                root_path="",
                updated_after=updated_after,
                report_text=report_text,
                check_cancelled=check_cancelled,
            )
            documents.extend(nested["documents"])
            current_document_ids.extend(nested["currentDocumentIds"])
            skipped_documents += nested["skippedDocuments"]

        return {
            "site": {
                "id": site["id"],
                "name": site_name or site.get("displayName", ""),
                "url": site_url,
                "libraryCount": len(drives),
                "listCount": len(lists),
                "status": "synced",
                "access": ["analyst", "admin"],
                "owner": site_name or site.get("displayName", ""),
            },
            "documents": documents,
            "currentDocumentIds": current_document_ids,
            "driveCount": len(drives),
            "listCount": len(lists),
            "skippedDocuments": skipped_documents,
        }

    def _crawl_drive_items(
        self,
        client: GraphClient,
        *,
        site_id: str,
        site_name: str,
        drive: Dict[str, Any],
        root_path: str,
        updated_after: Optional[str],
        report_text: Callable[[str], None],
        check_cancelled: Callable[[], None],
    ) -> Dict[str, Any]:
        cutoff_ms = self._parse_updated_after(updated_after)
        drive_name = str(drive.get("name", "Library"))
        display_path = f"{drive_name}/{root_path}" if root_path else drive_name
        report_text(f"[{site_name}] Scanning {display_path}")
        if root_path:
            path = f"/drives/{drive['id']}/root:/{self._encode_drive_path(root_path)}:/children?$top=200"
        else:
            path = f"/drives/{drive['id']}/root/children?$top=200"
        items = client.list_all(path, report_progress=report_text, label=f"[{site_name}] {display_path}")

        documents: List[Dict[str, Any]] = []
        current_document_ids: List[str] = []
        skipped_documents = 0

        for index, item in enumerate(items):
            check_cancelled()
            current_path = re.sub(r"/+", "/", f"{root_path}/{item.get('name', '')}")
            if isinstance(item.get("folder"), dict):
                nested = self._crawl_drive_items(
                    client,
                    site_id=site_id,
                    site_name=site_name,
                    drive=drive,
                    root_path=current_path,
                    updated_after=updated_after,
                    report_text=report_text,
                    check_cancelled=check_cancelled,
                )
                documents.extend(nested["documents"])
                current_document_ids.extend(nested["currentDocumentIds"])
                skipped_documents += nested["skippedDocuments"]
                continue

            if index > 0 and index % 100 == 0:
                report_text(f"[{site_name}] {display_path}: processed {index}/{len(items)} items")

            item_name = str(item.get("name", ""))
            extension = item_name.rsplit(".", 1)[-1].lower() if "." in item_name else ""
            document_id = hashlib.sha1(f"{site_id}:{drive['id']}:{item.get('id', '')}".encode("utf-8")).hexdigest()
            current_document_ids.append(document_id)
            updated_at = str(item.get("lastModifiedDateTime") or item.get("createdDateTime") or "")
            if not self._is_newer_than_cutoff(updated_at, cutoff_ms):
                skipped_documents += 1
                report_text(
                    f"[{site_name}] {drive_name}{current_path} skipped unchanged item last modified at {updated_at or 'unknown timestamp'}"
                )
                continue

            file_payload = item.get("file") if isinstance(item.get("file"), dict) else {}
            mime_type = str(file_payload.get("mimeType") or "")
            item_size = item.get("size")
            raw_text = ""
            if self._is_textual_item(item_name, mime_type) and (not isinstance(item_size, int) or item_size <= MAX_TEXT_DOWNLOAD_BYTES):
                raw_text = self._try_download_text(client, f"/drives/{drive['id']}/items/{item['id']}")
            elif isinstance(item_size, int) and item_size > MAX_TEXT_DOWNLOAD_BYTES:
                report_text(f"[{site_name}] {drive_name}{current_path} over size limit ({item_size} bytes), keeping metadata only")

            fallback_text = f"Source: {item_name}. Path: {current_path}."
            text = raw_text or fallback_text
            normalized_path = re.sub(r"/+", "/", f"/{drive_name}/{current_path}")
            title = item_name.rsplit(".", 1)[0] if "." in item_name else item_name
            documents.append(
                {
                    "id": document_id,
                    "siteId": site_id,
                    "kind": extension or "file",
                    "fileType": self._infer_file_type(item_name, mime_type),
                    "title": title,
                    "path": normalized_path,
                    "webUrl": item.get("webUrl"),
                    "author": site_name,
                    "createdBy": self._get_graph_person_name(item.get("createdBy")),
                    "lastModifiedBy": self._get_graph_person_name(item.get("lastModifiedBy")),
                    "updatedAt": updated_at or utc_now_iso(),
                    "summary": self._build_summary(text, title),
                    "directAnswer": self._build_direct_answer(text, title),
                    "content": text[:4000],
                    "tags": self._build_tags(site_name, drive_name, current_path, extension or "file", title, text),
                    "access": ["analyst", "admin"],
                    "source": "SharePoint",
                }
            )

        return {
            "documents": documents,
            "currentDocumentIds": current_document_ids,
            "skippedDocuments": skipped_documents,
        }

    def _try_download_text(self, client: GraphClient, item_path: str) -> str:
        for candidate in (f"{item_path}/content?format=html", f"{item_path}/content?format=text", f"{item_path}/content"):
            try:
                text, content_type = client.get_text(candidate)
            except Exception:
                continue
            if "html" in content_type or "format=html" in candidate:
                return self._normalize_html_to_text(text)
            return text.replace("\u0000", "").strip()
        return ""

    def _build_live_export_corpus(
        self,
        *,
        config: LiveExportConfig,
        started_at: str,
        synced_at: str,
        sites: List[Dict[str, Any]],
        documents: List[Dict[str, Any]],
        site_ids: List[str],
        total_libraries: int,
        total_lists: int,
        notes: str,
        status: str,
        merged_env: Dict[str, str],
    ) -> Dict[str, Any]:
        return {
            "schemaVersion": "1.1",
            "defaultUserRole": "analyst",
            "providers": [
                {"id": "openai", "name": "OpenAI", "ready": bool(merged_env.get("OPENAI_API_KEY") or self._settings.openai_api_key)},
                {"id": "gemini", "name": "Gemini", "ready": bool(merged_env.get("GEMINI_API_KEY") or self._settings.gemini_api_key)},
                {"id": "anthropic", "name": "Claude", "ready": bool(merged_env.get("ANTHROPIC_API_KEY") or self._settings.anthropic_api_key)},
            ],
            "sites": sites,
            "syncedAt": synced_at,
            "syncRuns": [
                {
                    "id": f"sync-{synced_at[:10]}-live",
                    "startedAt": started_at,
                    "finishedAt": synced_at,
                    "scope": f"SharePoint live export from {len(config.site_urls)} configured site(s)",
                    "status": status,
                    "siteIds": site_ids,
                    "documentsSynced": len(documents),
                    "chunksWritten": len(documents) * 6,
                    "notes": notes,
                }
            ],
            "documents": documents,
        }

    def _build_sync_state_payload(self, *, corpus: Dict[str, Any], mode: str, corpus_path: Path) -> Dict[str, Any]:
        role = str(corpus.get("defaultUserRole") or "analyst")
        documents = corpus.get("documents", []) if isinstance(corpus.get("documents"), list) else []
        permitted_documents = [
            document
            for document in documents
            if isinstance(document, dict) and (role in document.get("access", []) or "all" in document.get("access", []))
        ]
        sync_runs = corpus.get("syncRuns", [])
        last_run = max(sync_runs, key=lambda run: str(run.get("finishedAt", ""))) if isinstance(sync_runs, list) and sync_runs else None

        site_summaries = []
        sites = corpus.get("sites", []) if isinstance(corpus.get("sites"), list) else []
        for site in sites:
            if not isinstance(site, dict):
                continue
            site_documents = [document for document in documents if document.get("siteId") == site.get("id")]
            permitted_site_documents = [
                document
                for document in site_documents
                if role in document.get("access", []) or "all" in document.get("access", [])
            ]
            latest_sync = None
            if isinstance(sync_runs, list) and sync_runs:
                matching_runs = [run for run in sync_runs if site.get("id") in run.get("siteIds", [])]
                if matching_runs:
                    latest_sync = max(matching_runs, key=lambda run: str(run.get("finishedAt", "")))
            site_summaries.append(
                {
                    **site,
                    "documentCount": len(site_documents),
                    "permittedDocumentCount": len(permitted_site_documents),
                    "chunkCount": len(permitted_site_documents) * 6,
                    "lastRefresh": latest_sync.get("finishedAt") if latest_sync else None,
                    "lastRefreshStatus": latest_sync.get("status") if latest_sync else "pending",
                }
            )

        sync_overview = {
            "siteSummaries": site_summaries,
            "documentCount": len(permitted_documents),
            "chunkCount": len(permitted_documents) * 6,
            "syncedSites": len([site for site in site_summaries if site.get("status") == "synced"]),
            "restrictedSites": len([site for site in site_summaries if site.get("status") == "restricted"]),
            "providerReadiness": corpus.get("providers", []),
            "lastRun": last_run,
            "refreshPolicy": "Incremental daily refresh with manual refresh on demand",
        }
        summary = {
            **sync_overview,
            "sourcesIndexed": len(documents),
            "visibleSources": len(permitted_documents),
            "deniedSources": len(documents) - len(permitted_documents),
        }
        return {
            "generatedAt": utc_now_iso(),
            "mode": mode,
            "corpusPath": str(corpus_path),
            "summary": summary,
            "syncOverview": sync_overview,
            "sites": site_summaries,
        }

    def _read_checkpoint(self) -> Optional[Dict[str, Any]]:
        path = self._runtime_store.live_export_checkpoint_path()
        if not path.exists():
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None
        return payload if isinstance(payload, dict) else None

    def _resolve_resume_state(self, resume_requested: bool, checkpoint: Optional[Dict[str, Any]]) -> Tuple[bool, Optional[str]]:
        if not resume_requested:
            return False, None
        updated_after = None
        if isinstance(checkpoint, dict):
            synced_at = checkpoint.get("syncedAt")
            if isinstance(synced_at, str) and synced_at:
                updated_after = synced_at
            else:
                sync_runs = checkpoint.get("syncRuns", [])
                if isinstance(sync_runs, list) and sync_runs:
                    finished_at = sync_runs[0].get("finishedAt")
                    if isinstance(finished_at, str) and finished_at:
                        updated_after = finished_at
        return bool(checkpoint and updated_after), updated_after

    def _merge_env(self, env: Optional[Dict[str, str]]) -> Dict[str, str]:
        merged = dict(os.environ)
        for key, value in (env or {}).items():
            if value is not None:
                merged[key] = value
        return merged

    def _parse_csv(self, value: Optional[str]) -> List[str]:
        return [entry.strip() for entry in (value or "").split(",") if entry.strip()]

    def _build_site_definitions(self, config: LiveExportConfig) -> List[Tuple[str, str]]:
        definitions: List[Tuple[str, str]] = []
        for index, site_url in enumerate(config.site_urls):
            parsed = urlparse(site_url)
            default_name = parsed.hostname or site_url
            definitions.append((site_url, config.site_names[index] if index < len(config.site_names) else default_name))
        return definitions

    def _encode_drive_path(self, path: str) -> str:
        return "/".join(quote(segment) for segment in path.split("/") if segment)

    def _site_url_to_graph_path(self, site_url: str) -> str:
        parsed = urlparse(site_url)
        return f"/sites/{parsed.hostname}:{parsed.path}"

    def _parse_updated_after(self, updated_after: Optional[str]) -> Optional[float]:
        if not updated_after:
            return None
        try:
            return self._parse_iso_timestamp(updated_after)
        except Exception:
            return None

    def _is_newer_than_cutoff(self, timestamp: str, cutoff_ms: Optional[float]) -> bool:
        if cutoff_ms is None or not timestamp:
            return True
        try:
            parsed = self._parse_iso_timestamp(timestamp)
        except Exception:
            return True
        return parsed > cutoff_ms

    def _parse_iso_timestamp(self, value: str) -> float:
        normalized = value.strip()
        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()

    def _is_textual_item(self, name: str, mime_type: str) -> bool:
        extension = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if extension in TEXTUAL_EXTENSIONS:
            return True
        return any(mime_type.startswith(prefix) for prefix in TEXTUAL_MIME_PREFIXES)

    def _infer_file_type(self, name: str, mime_type: str) -> str:
        extension = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        file_type_map = {
            "doc": "document",
            "docx": "document",
            "odt": "document",
            "rtf": "document",
            "pages": "document",
            "pdf": "pdf",
            "ppt": "presentation",
            "pptx": "presentation",
            "key": "presentation",
            "xls": "spreadsheet",
            "xlsx": "spreadsheet",
            "csv": "spreadsheet",
            "tsv": "spreadsheet",
            "numbers": "spreadsheet",
            "md": "markdown",
            "markdown": "markdown",
            "txt": "text",
            "json": "json",
            "xml": "xml",
            "html": "html",
            "htm": "html",
            "aspx": "html",
            "msg": "email",
            "eml": "email",
        }

        if extension in file_type_map:
            return file_type_map[extension]
        if mime_type.startswith("text/"):
            return "text"
        if mime_type == "application/pdf":
            return "pdf"
        return extension or "file"

    def _normalize_html_to_text(self, value: str) -> str:
        stripped = re.sub(r"<script[\s\S]*?</script>", " ", value, flags=re.IGNORECASE)
        stripped = re.sub(r"<style[\s\S]*?</style>", " ", stripped, flags=re.IGNORECASE)
        stripped = re.sub(r"<[^>]+>", " ", stripped)
        stripped = html.unescape(stripped)
        return re.sub(r"\s+", " ", stripped).strip()

    def _is_metadata_only_text(self, text: str) -> bool:
        return bool(re.match(r"^Source:\s", text, flags=re.IGNORECASE) and re.search(r"\bPath:\s", text))

    def _build_summary(self, text: str, fallback: str) -> str:
        cleaned = re.sub(r"\s+", " ", text).strip()
        if not cleaned or self._is_metadata_only_text(cleaned):
            return fallback
        sentence = re.split(r"(?<=[.!?])\s+", cleaned)[0]
        return sentence[:240] or fallback

    def _build_direct_answer(self, text: str, fallback: str) -> str:
        cleaned = re.sub(r"\s+", " ", text).strip()
        if not cleaned or self._is_metadata_only_text(cleaned):
            return fallback
        return cleaned[:360]

    def _get_graph_person_name(self, value: Any) -> str:
        if not isinstance(value, dict):
            return ""
        user = value.get("user")
        if not isinstance(user, dict):
            return ""
        return str(user.get("displayName") or "").strip()

    def _extract_meaningful_tokens(self, text: str) -> List[str]:
        stop_words = {"the", "and", "for", "with", "from", "this", "that", "site", "file", "list", "library"}
        tokens = re.findall(r"[a-zA-Z0-9][a-zA-Z0-9_-]{2,}", text.lower())
        deduped: List[str] = []
        for token in tokens:
            if token in stop_words or token in deduped:
                continue
            deduped.append(token)
        return deduped

    def _build_tags(self, site_name: str, drive_name: str, item_path: str, kind: str, title: str, text: str) -> List[str]:
        first_sentence = re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", text).strip())[0] if text else ""
        candidates = [title, site_name, drive_name, kind, *[part.rsplit(".", 1)[0] for part in item_path.split("/") if part], first_sentence]
        tags: List[str] = []
        for candidate in candidates:
            for token in self._extract_meaningful_tokens(candidate):
                if token not in tags:
                    tags.append(token)
                if len(tags) >= 12:
                    return tags
        return tags

    def _upsert_site(self, sites: List[Dict[str, Any]], incoming_site: Dict[str, Any]) -> List[Dict[str, Any]]:
        next_sites = list(sites)
        for index, site in enumerate(next_sites):
            if site.get("id") == incoming_site.get("id") or site.get("url") == incoming_site.get("url"):
                next_sites[index] = incoming_site
                return next_sites
        next_sites.append(incoming_site)
        return next_sites

    def _reconcile_site_documents(
        self,
        existing_documents: List[Dict[str, Any]],
        incoming_documents: List[Dict[str, Any]],
        site_id: str,
        current_document_ids: List[str],
    ) -> List[Dict[str, Any]]:
        current_ids = set(current_document_ids)
        retained_documents = [
            document
            for document in existing_documents
            if document.get("siteId") != site_id or document.get("id") in current_ids
        ]
        by_id = {document.get("id"): document for document in retained_documents}
        for document in incoming_documents:
            by_id[document.get("id")] = document
        return list(by_id.values())

    def _is_truthy(self, value: Optional[str]) -> bool:
        return str(value or "").strip().lower() in {"1", "true", "yes", "on"}
