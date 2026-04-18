from __future__ import annotations

import json
from pathlib import Path

from worker.app.config import Settings
from worker.app.services.corpus_service import CorpusService


def test_local_mode_reads_mock_corpus(tmp_path: Path) -> None:
    corpus_path = tmp_path / "corpus.json"
    corpus_path.write_text(
        json.dumps(
            {
                "schemaVersion": "1.1",
                "defaultUserRole": "analyst",
                "providers": [],
                "sites": [],
                "syncRuns": [],
                "documents": [],
            }
        ),
        encoding="utf-8",
    )
    service = CorpusService(Settings(WORKER_MODE="local", WORKER_MOCK_CORPUS_PATH=corpus_path))

    payload = service.load_corpus_payload()

    assert payload["schemaVersion"] == "1.1"
    assert service.resolve_corpus_path() == corpus_path


def test_validate_corpus_payload_reports_counts(tmp_path: Path) -> None:
    corpus_path = tmp_path / "corpus.json"
    corpus_path.write_text(
        json.dumps(
            {
                "schemaVersion": "1.1",
                "defaultUserRole": "analyst",
                "providers": [],
                "sites": [{"id": "site-1"}],
                "syncRuns": [],
                "documents": [{"id": "doc-1"}],
            }
        ),
        encoding="utf-8",
    )
    service = CorpusService(Settings(WORKER_MODE="local", WORKER_MOCK_CORPUS_PATH=corpus_path))

    validation = service.validate_corpus_payload(service.load_corpus_payload())

    assert validation["valid"] is True
    assert validation["documentCount"] == 1
    assert validation["siteCount"] == 1
    assert validation["path"] == str(corpus_path)
