from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx
from jose import ExpiredSignatureError, JWTError, jwt

from worker.app.config import Settings
from worker.app.errors import http_error


def auth_enabled(flag: bool) -> bool:
    return flag


@dataclass(frozen=True)
class AuthContext:
    oid: str
    tid: str
    claims: Dict[str, Any]


class TokenValidator:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._tenant_id = settings.entra_tenant_id.strip()
        self._client_id = settings.entra_client_id.strip()
        self._jwks_uri = f"https://login.microsoftonline.com/{self._tenant_id}/discovery/v2.0/keys"
        self._issuers = {
            f"https://login.microsoftonline.com/{self._tenant_id}/v2.0",
            f"https://login.microsoftonline.com/{self._tenant_id}/v2.0/",
            f"https://sts.windows.net/{self._tenant_id}",
            f"https://sts.windows.net/{self._tenant_id}/",
        }
        self._audiences = {
            self._client_id,
            f"api://{self._client_id}",
        }
        self._keys_by_kid: Dict[str, Dict[str, Any]] = {}

    @property
    def enabled(self) -> bool:
        return auth_enabled(self._settings.worker_auth_enabled)

    def preload(self) -> None:
        if not self.enabled:
            return
        if not self._tenant_id:
            raise RuntimeError("ENTRA_TENANT_ID is required when WORKER_AUTH_ENABLED=true.")
        if not self._client_id:
            raise RuntimeError("ENTRA_CLIENT_ID is required when WORKER_AUTH_ENABLED=true.")
        self._refresh_keys()

    def validate_authorization_header(self, authorization_header: Optional[str]) -> AuthContext:
        if not self.enabled:
            return AuthContext(oid="", tid="", claims={})
        if not authorization_header:
            raise self._unauthorized("Missing Authorization header.")

        scheme, _, token = authorization_header.partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            raise self._unauthorized("Authorization header must use Bearer token auth.")

        return self.validate_token(token.strip())

    def validate_token(self, token: str) -> AuthContext:
        if not self.enabled:
            return AuthContext(oid="", tid="", claims={})

        try:
            header = jwt.get_unverified_header(token)
        except JWTError as exc:
            raise self._unauthorized("Token header could not be parsed.") from exc

        kid = header.get("kid")
        if not isinstance(kid, str) or not kid:
            raise self._unauthorized("Token header is missing kid.")

        key = self._keys_by_kid.get(kid)
        if key is None:
            self._refresh_keys()
            key = self._keys_by_kid.get(kid)
        if key is None:
            raise self._unauthorized("Token signing key is not trusted.")

        try:
            claims = jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                options={
                    "verify_aud": False,
                    "verify_iss": False,
                },
            )
        except ExpiredSignatureError as exc:
            raise self._unauthorized("Token has expired.") from exc
        except JWTError as exc:
            raise self._unauthorized("Token validation failed.") from exc

        audience = claims.get("aud")
        if isinstance(audience, str):
            audience_values = {audience}
        elif isinstance(audience, list) and all(isinstance(value, str) for value in audience):
            audience_values = set(audience)
        else:
            audience_values = set()
        if not audience_values.intersection(self._audiences):
            raise self._unauthorized("Token audience is not valid for this API.")

        issuer = claims.get("iss")
        if not isinstance(issuer, str) or issuer not in self._issuers:
            raise self._unauthorized("Token issuer is not valid for this tenant.")

        oid = claims.get("oid")
        tid = claims.get("tid")
        if not isinstance(oid, str) or not oid:
            raise self._unauthorized("Token is missing oid claim.")
        if not isinstance(tid, str) or not tid:
            raise self._unauthorized("Token is missing tid claim.")

        return AuthContext(oid=oid, tid=tid, claims=dict(claims))

    def _refresh_keys(self) -> None:
        response = httpx.get(self._jwks_uri, timeout=10.0)
        response.raise_for_status()
        payload = response.json()
        keys = payload.get("keys")
        if not isinstance(keys, list):
            raise RuntimeError("Entra JWKS payload is invalid.")

        self._keys_by_kid = {
            key["kid"]: key
            for key in keys
            if isinstance(key, dict) and isinstance(key.get("kid"), str)
        }
        if not self._keys_by_kid:
            raise RuntimeError("Entra JWKS payload did not contain any usable signing keys.")

    def _unauthorized(self, message: str):
        return http_error(code="unauthorized", message=message, status_code=401)
