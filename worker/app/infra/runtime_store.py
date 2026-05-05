from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional
import json
import re
from uuid import uuid4

from worker.app.config import get_settings


class RuntimeStore:
    def __init__(self, runtime_dir: Path) -> None:
        self.runtime_dir = runtime_dir

    def corpus_version(self) -> Optional[str]:
        corpus_path = self.runtime_dir / "corpus-published.json"
        if not corpus_path.exists():
            return None
        return f"file:{corpus_path.stat().st_mtime_ns}"

    def ensure_runtime_dirs(self) -> None:
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        self.jobs_dir().mkdir(parents=True, exist_ok=True)

    def jobs_dir(self) -> Path:
        return self.runtime_dir / "jobs"

    def sync_state_path(self, mode: str = "mock") -> Path:
        if mode == "live":
            return self.runtime_dir / "sync-state.live.json"
        return self.runtime_dir / "sync-state.json"

    def analyzed_corpus_path(self) -> Path:
        return self.runtime_dir / "analyzed-corpus.json"

    def analyze_report_path(self) -> Path:
        return self.runtime_dir / "analyze-report.json"

    def live_export_checkpoint_path(self) -> Path:
        return self.runtime_dir / "live-export-checkpoint.json"

    def live_corpus_path(self) -> Path:
        return self.runtime_dir.parent.parent / "public" / "live-corpus.json"

    def extract_artifact_path(self, site_id: str, source_id: str) -> Path:
        return self.runtime_dir / self.extract_artifact_relative_path(site_id, source_id)

    def extract_artifact_relative_path(self, site_id: str, source_id: str) -> Path:
        return Path("extracts") / self._safe_path_part(site_id) / f"{self._safe_path_part(source_id)}.json"

    def job_metadata_path(self, job_id: str) -> Path:
        return self.jobs_dir() / f"{job_id}.json"

    def job_events_path(self, job_id: str) -> Path:
        return self.jobs_dir() / f"{job_id}.events.jsonl"

    def write_job_metadata(self, job_id: str, payload: Dict[str, Any]) -> None:
        self.ensure_runtime_dirs()
        self._write_text_atomic(self.job_metadata_path(job_id), f"{json.dumps(payload, indent=2)}\n")

    def read_job_metadata(self, job_id: str) -> Optional[Dict[str, Any]]:
        path = self.job_metadata_path(job_id)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def append_job_event(self, job_id: str, payload: Dict[str, Any]) -> None:
        self.ensure_runtime_dirs()
        with self.job_events_path(job_id).open("a", encoding="utf-8") as handle:
            handle.write(f"{json.dumps(payload)}\n")

    def read_job_events(self, job_id: str) -> List[Dict[str, Any]]:
        path = self.job_events_path(job_id)
        if not path.exists():
            return []
        events: List[Dict[str, Any]] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            events.append(json.loads(line))
        return events

    def write_sync_state(self, payload: Dict[str, Any], mode: str = "mock") -> Path:
        self.ensure_runtime_dirs()
        path = self.sync_state_path(mode)
        self._write_text_atomic(path, f"{json.dumps(payload, indent=2)}\n")
        return path

    def write_json_artifact(self, path: Path, payload: Dict[str, Any]) -> Path:
        self.ensure_runtime_dirs()
        path.parent.mkdir(parents=True, exist_ok=True)
        self._write_text_atomic(path, f"{json.dumps(payload, indent=2)}\n")
        return path

    def _write_text_atomic(self, path: Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_name(f"{path.name}.{uuid4().hex}.tmp")
        temp_path.write_text(content, encoding="utf-8")
        temp_path.replace(path)

    def _safe_path_part(self, value: str) -> str:
        safe = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip("-._")
        return safe[:120] or "unknown"


def get_runtime_store() -> RuntimeStore:
    settings = get_settings()
    return RuntimeStore(settings.runtime_data_dir)
