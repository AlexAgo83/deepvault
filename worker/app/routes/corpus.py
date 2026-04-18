from __future__ import annotations

from json import JSONDecodeError

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse

from worker.app.dependencies import get_corpus_service
from worker.app.errors import build_error_envelope
from worker.app.services.corpus_service import CorpusService


router = APIRouter(tags=["corpus"])


@router.get("/api/corpus")
def get_corpus(
    request: Request,
    response: Response,
    corpus_service: CorpusService = Depends(get_corpus_service),
) -> Response:
    try:
        payload_bytes = corpus_service.load_corpus_bytes()
        etag = corpus_service.build_etag(payload_bytes)
        if request.headers.get("if-none-match") == etag:
            response.status_code = status.HTTP_304_NOT_MODIFIED
            response.headers["ETag"] = etag
            return response

        payload = corpus_service.load_corpus_payload()
        response = JSONResponse(content=payload)
        response.headers["ETag"] = etag
        return response
    except FileNotFoundError:
        envelope = build_error_envelope("corpus_missing", "Corpus file is not available.")
        return JSONResponse(status_code=404, content=envelope.model_dump())
    except JSONDecodeError:
        envelope = build_error_envelope("corpus_invalid", "Corpus file could not be parsed as JSON.")
        return JSONResponse(status_code=500, content=envelope.model_dump())
