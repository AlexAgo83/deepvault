from __future__ import annotations

from typing import Iterable, Optional

from worker.app.auth.token_validation import AuthContext


def is_operator(auth_context: Optional[AuthContext] = None, allowlist: Optional[Iterable[str]] = None) -> bool:
    if auth_context is None:
        return False

    allowed = {value.strip().lower() for value in (allowlist or ()) if value and value.strip()}
    return auth_context.oid.strip().lower() in allowed
