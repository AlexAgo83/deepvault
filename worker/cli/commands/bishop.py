from __future__ import annotations

from typing import Any, Dict, List, Optional

from worker.app.services.bishop_service import BishopService


def query(
    bishop_service: BishopService,
    *,
    question: str,
    role: str = "analyst",
    provider: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    return bishop_service.query(query=question, role=role, provider=provider, history=history or [])
