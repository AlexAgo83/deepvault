from __future__ import annotations

from typing import Any, Dict

from worker.app.services.corpus_service import CorpusService


def show(corpus_service: CorpusService) -> Dict[str, Any]:
    return corpus_service.load_corpus_payload()


def validate(corpus_service: CorpusService) -> Dict[str, Any]:
    return corpus_service.validate_corpus_payload(corpus_service.load_corpus_payload())
