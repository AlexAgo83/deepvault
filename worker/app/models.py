from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict


class ErrorDetails(BaseModel):
    model_config = ConfigDict(extra="allow")


class ErrorInfo(BaseModel):
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


class ErrorEnvelope(BaseModel):
    error: ErrorInfo


class WorkerFeatures(BaseModel):
    authEnabled: bool


class HealthResponse(BaseModel):
    status: str
    workerVersion: str
    mode: str
    timestamp: str


class ConfigModeResponse(BaseModel):
    mode: str
    workerVersion: str
    corpusVersion: Optional[str]
    isOperator: bool
    features: WorkerFeatures
    timestamp: str
