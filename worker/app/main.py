from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from worker.app.access_log import AccessLogger
from worker.app.auth.token_validation import TokenValidator
from worker.app.config import Settings, get_settings
from worker.app.errors import build_error_envelope
from worker.app.routes.bishop import router as bishop_router
from worker.app.routes.corpus import router as corpus_router
from worker.app.routes.config_mode import router as config_mode_router
from worker.app.routes.health import router as health_router
from worker.app.routes.jobs import router as jobs_router

PUBLIC_PATHS = {
    "/api/health",
    "/api/config/mode",
}


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    resolved_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.auth_validator.preload()
        yield

    app = FastAPI(title="DeepVault Nexus Worker", version="1.0.0", lifespan=lifespan)
    app.state.auth_validator = TokenValidator(resolved_settings)
    app.state.access_logger = AccessLogger(resolved_settings.access_log_dir)
    if settings is not None:
        app.dependency_overrides[get_settings] = lambda: resolved_settings

    if not resolved_settings.worker_auth_enabled:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @app.middleware("http")
    async def auth_middleware(request: Request, call_next):
        request.state.auth_context = None

        if not request.url.path.startswith("/api/") or request.method == "OPTIONS":
            return await call_next(request)

        validator: TokenValidator = request.app.state.auth_validator
        auth_header = request.headers.get("Authorization")

        if request.url.path in PUBLIC_PATHS:
            if validator.enabled and auth_header:
                try:
                    request.state.auth_context = validator.validate_authorization_header(auth_header)
                except Exception as exc:
                    if hasattr(exc, "status_code") and hasattr(exc, "detail"):
                        return JSONResponse(status_code=exc.status_code, content=exc.detail)
                    envelope = build_error_envelope("unauthorized", "Request authorization failed.")
                    return JSONResponse(status_code=401, content=envelope.model_dump())
            response = await call_next(request)
        elif not validator.enabled:
            response = await call_next(request)
        else:
            try:
                request.state.auth_context = validator.validate_authorization_header(auth_header)
            except Exception as exc:
                if hasattr(exc, "status_code") and hasattr(exc, "detail"):
                    return JSONResponse(status_code=exc.status_code, content=exc.detail)
                envelope = build_error_envelope("unauthorized", "Request authorization failed.")
                return JSONResponse(status_code=401, content=envelope.model_dump())
            response = await call_next(request)

        auth_context = getattr(request.state, "auth_context", None)
        if auth_context is not None:
            request.app.state.access_logger.log(
                oid=auth_context.oid,
                endpoint=request.url.path,
                status=response.status_code,
            )
        return response

    app.include_router(health_router)
    app.include_router(config_mode_router)
    app.include_router(corpus_router)
    app.include_router(bishop_router)
    app.include_router(jobs_router)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        envelope = build_error_envelope("validation_error", "Request validation failed.", {"errors": exc.errors()})
        return JSONResponse(status_code=422, content=envelope.model_dump())

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
        if isinstance(exc.detail, dict):
            return JSONResponse(status_code=exc.status_code, content=exc.detail)
        envelope = build_error_envelope("http_error", str(exc.detail))
        return JSONResponse(status_code=exc.status_code, content=envelope.model_dump())

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
        envelope = build_error_envelope("internal_error", "Unexpected worker error.", {"type": exc.__class__.__name__})
        return JSONResponse(status_code=500, content=envelope.model_dump())

    return app


app = create_app()
