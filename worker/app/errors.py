from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import HTTPException, status

from worker.app.models import ErrorEnvelope, ErrorInfo


def build_error_envelope(code: str, message: str, details: Optional[Dict[str, Any]] = None) -> ErrorEnvelope:
    return ErrorEnvelope(error=ErrorInfo(code=code, message=message, details=details))


def http_error(
    *,
    code: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
    status_code: int = status.HTTP_400_BAD_REQUEST,
) -> HTTPException:
    return HTTPException(status_code=status_code, detail=build_error_envelope(code, message, details).model_dump())
