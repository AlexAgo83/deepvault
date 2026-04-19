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
    runtime_dir = tmp_path / "data" / "runtime"
    runtime_dir.mkdir(parents=True)
    service = CorpusService(
        Settings(WORKER_MODE="local", WORKER_MOCK_CORPUS_PATH=corpus_path, WORKER_RUNTIME_DATA_DIR=runtime_dir)
    )

    payload = service.load_corpus_payload()

    assert payload["schemaVersion"] == "1.1"
    assert service.resolve_corpus_path() == corpus_path


def test_local_mode_serves_live_corpus_when_present(tmp_path: Path) -> None:
    mock_path = tmp_path / "mock.json"
    mock_path.write_text(json.dumps({"schemaVersion": "mock"}), encoding="utf-8")
    # live-corpus.json lives at <root>/public/live-corpus.json
    # runtime_data_dir is <root>/data/runtime, so parent.parent == <root>
    runtime_dir = tmp_path / "data" / "runtime"
    runtime_dir.mkdir(parents=True)
    live_dir = tmp_path / "public"
    live_dir.mkdir()
    live_path = live_dir / "live-corpus.json"
    live_path.write_text(json.dumps({"schemaVersion": "live"}), encoding="utf-8")

    service = CorpusService(
        Settings(WORKER_MODE="local", WORKER_MOCK_CORPUS_PATH=mock_path, WORKER_RUNTIME_DATA_DIR=runtime_dir)
    )

    assert service.resolve_corpus_path() == live_path
    assert service.load_corpus_payload()["schemaVersion"] == "live"


def test_local_mode_falls_back_to_mock_when_no_live_corpus(tmp_path: Path) -> None:
    mock_path = tmp_path / "mock.json"
    mock_path.write_text(json.dumps({"schemaVersion": "mock"}), encoding="utf-8")
    runtime_dir = tmp_path / "data" / "runtime"
    runtime_dir.mkdir(parents=True)

    service = CorpusService(
        Settings(WORKER_MODE="local", WORKER_MOCK_CORPUS_PATH=mock_path, WORKER_RUNTIME_DATA_DIR=runtime_dir)
    )

    assert service.resolve_corpus_path() == mock_path


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
    runtime_dir = tmp_path / "data" / "runtime"
    runtime_dir.mkdir(parents=True)
    service = CorpusService(
        Settings(WORKER_MODE="local", WORKER_MOCK_CORPUS_PATH=corpus_path, WORKER_RUNTIME_DATA_DIR=runtime_dir)
    )

    validation = service.validate_corpus_payload(service.load_corpus_payload())

    assert validation["valid"] is True
    assert validation["documentCount"] == 1
    assert validation["siteCount"] == 1
    assert validation["path"] == str(corpus_path)
