from __future__ import annotations

import base64
from time import time
from typing import Dict, Tuple

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from jose import jwt

from worker.app.auth.token_validation import TokenValidator
from worker.app.config import Settings
from worker.app.main import create_app


def _b64url_uint(value: int) -> str:
    raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _build_signing_material() -> Tuple[str, Dict[str, object]]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_numbers = private_key.public_key().public_numbers()
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    jwk = {
        "kty": "RSA",
        "use": "sig",
        "alg": "RS256",
        "kid": "test-kid",
        "n": _b64url_uint(public_numbers.n),
        "e": _b64url_uint(public_numbers.e),
    }
    return private_pem, jwk


class _FakeJwksResponse:
    def __init__(self, jwk: Dict[str, object]) -> None:
        self._jwk = jwk

    def raise_for_status(self) -> None:
        return None

    def json(self) -> Dict[str, object]:
        return {"keys": [self._jwk]}


def _build_token(private_pem: str) -> str:
    now = int(time())
    return jwt.encode(
        {
            "aud": "client-id",
            "iss": "https://login.microsoftonline.com/tenant-id/v2.0",
            "tid": "tenant-id",
            "oid": "user-object-id",
            "sub": "subject-123",
            "exp": now + 3600,
            "nbf": now - 5,
            "iat": now - 5,
        },
        private_pem,
        algorithm="RS256",
        headers={"kid": "test-kid"},
    )


def test_corpus_requires_valid_bearer_token_when_worker_auth_enabled(monkeypatch) -> None:
    private_pem, jwk = _build_signing_material()
    monkeypatch.setattr(
        "worker.app.auth.token_validation.httpx.get",
        lambda *args, **kwargs: _FakeJwksResponse(jwk),
    )
    app = create_app(
        Settings(
            WORKER_AUTH_ENABLED=True,
            ENTRA_TENANT_ID="tenant-id",
            ENTRA_CLIENT_ID="client-id",
        )
    )

    with TestClient(app) as client:
        missing = client.get("/api/corpus")
        assert missing.status_code == 401

        valid = client.get("/api/corpus", headers={"Authorization": f"Bearer {_build_token(private_pem)}"})
        assert valid.status_code == 200


def test_bishop_requires_valid_token_when_worker_auth_enabled(monkeypatch) -> None:
    private_pem, jwk = _build_signing_material()
    monkeypatch.setattr(
        "worker.app.auth.token_validation.httpx.get",
        lambda *args, **kwargs: _FakeJwksResponse(jwk),
    )
    app = create_app(
        Settings(
            WORKER_AUTH_ENABLED=True,
            ENTRA_TENANT_ID="tenant-id",
            ENTRA_CLIENT_ID="client-id",
        )
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/bishop/query",
            json={"query": "What are the known issues with the current SSO implementation?"},
            headers={"Authorization": f"Bearer {_build_token(private_pem)}"},
        )
        assert response.status_code == 200


def test_auth_validator_extracts_oid_for_follow_on_middleware(monkeypatch) -> None:
    private_pem, jwk = _build_signing_material()
    monkeypatch.setattr(
        "worker.app.auth.token_validation.httpx.get",
        lambda *args, **kwargs: _FakeJwksResponse(jwk),
    )
    validator = TokenValidator(
        Settings(
            WORKER_AUTH_ENABLED=True,
            ENTRA_TENANT_ID="tenant-id",
            ENTRA_CLIENT_ID="client-id",
        )
    )
    validator.preload()

    context = validator.validate_token(_build_token(private_pem))

    assert context.oid == "user-object-id"
    assert context.tid == "tenant-id"


def test_worker_auth_bypass_preserves_local_dev_mode() -> None:
    app = create_app(Settings(WORKER_AUTH_ENABLED=False))

    with TestClient(app) as client:
        response = client.get("/api/corpus")
        assert response.status_code == 200
