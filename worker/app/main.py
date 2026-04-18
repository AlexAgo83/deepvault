from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from worker.app.errors import build_error_envelope
from worker.app.routes.config_mode import router as config_mode_router
from worker.app.routes.health import router as health_router


app = FastAPI(title="DeepVault Nexus Worker", version="1.0.0")
app.include_router(health_router)
app.include_router(config_mode_router)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    envelope = build_error_envelope("validation_error", "Request validation failed.", {"errors": exc.errors()})
    return JSONResponse(status_code=422, content=envelope.model_dump())


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    envelope = build_error_envelope("internal_error", "Unexpected worker error.", {"type": exc.__class__.__name__})
    return JSONResponse(status_code=500, content=envelope.model_dump())
