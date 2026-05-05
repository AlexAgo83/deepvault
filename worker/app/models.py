from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


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


class WorkerAuthConfigResponse(BaseModel):
    enabled: bool
    tenantId: Optional[str] = None
    clientId: Optional[str] = None
    scope: Optional[str] = None


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
    auth: WorkerAuthConfigResponse
    timestamp: str


class BishopQueryRequest(BaseModel):
    query: Optional[str] = None
    question: Optional[str] = None
    role: Optional[str] = None
    provider: Optional[str] = None
    history: Optional[List[Dict[str, str]]] = None


class BishopSourceResponse(BaseModel):
    id: str
    title: str
    siteId: str
    siteName: str
    path: str
    webUrl: Optional[str] = None
    updatedAt: str
    author: str
    score: float
    summary: str
    tags: List[str]
    access: List[str]
    snippet: str
    source: str
    sectionHint: Optional[str] = None
    fileType: Optional[str] = None
    extractionStatus: Optional[str] = None
    extractionReason: Optional[str] = None


class BishopTraceResponse(BaseModel):
    mode: str
    providerTracePreview: str
    prompt: str


class BishopQueryResponse(BaseModel):
    status: str
    provider: str
    query: str
    answer: str
    model: Optional[str] = None
    sources: List[BishopSourceResponse]
    deniedSources: List[BishopSourceResponse]
    chunkCount: int
    tokenCount: int
    inputTokenCount: Optional[int] = None
    outputTokenCount: Optional[int] = None
    usageKind: str
    latencyMs: int
    confidence: int
    trace: BishopTraceResponse


class JobStartRequest(BaseModel):
    type: str
    options: Dict[str, Any] = Field(default_factory=dict)


class JobStartResponse(BaseModel):
    jobId: str
    status: str


class JobSummaryResponse(BaseModel):
    jobId: str
    type: str
    status: str
    startedAt: str
    finishedAt: Optional[str] = None
    summary: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    launchedBy: Optional[str] = None
    client: Optional[str] = None
    effectiveConfig: Optional[Dict[str, Any]] = None
