from __future__ import annotations

from fastapi import APIRouter, Depends

from worker.app.dependencies import get_bishop_service
from worker.app.models import BishopQueryRequest, BishopQueryResponse
from worker.app.services.bishop_service import BishopService


router = APIRouter(tags=["bishop"])


@router.post("/api/bishop/query", response_model=BishopQueryResponse)
def post_bishop_query(
    payload: BishopQueryRequest,
    bishop_service: BishopService = Depends(get_bishop_service),
) -> BishopQueryResponse:
    query = (payload.query or payload.question or "").strip()
    result = bishop_service.query(
        query=query,
        role=(payload.role or "analyst").strip() or "analyst",
        provider=(payload.provider or "").strip() or None,
        history=payload.history or [],
    )
    return BishopQueryResponse(**result)
