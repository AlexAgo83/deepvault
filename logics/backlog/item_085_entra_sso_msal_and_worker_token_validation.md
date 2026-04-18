## item_085_entra_sso_msal_and_worker_token_validation - Entra SSO — MSAL browser integration and worker token validation

> From version: 1.3.0
> Schema version: 1.0
> Status: Ready
> Understanding: 96%
> Confidence: 95%
> Progress: 0%
> Complexity: High
> Theme: Security / Architecture
> Reminder: Update status, understanding, confidence, progress and linked request/task references when you edit this doc.

# Problem

- The hosted Nexus app is accessible to anyone who discovers the URL — there is no authentication in the current local-first model.
- In hosted mode, Entra SSO must gate access: only team members with a Microsoft 365 account in the organization's Entra tenant can reach the app.
- The Python worker must validate the Entra token on every incoming request so job control and corpus endpoints cannot be accessed without authentication.

# Scope

- In: integrate `@azure/msal-browser` in the React app for browser-side token acquisition (silent SSO first, redirect fallback); attach the Entra access token to all worker API requests in the `Authorization: Bearer` header; implement JWKS-based token validation middleware in `worker/auth.py` — fetch JWKS from `https://login.microsoftonline.com/<tenant>/discovery/v2.0/keys`, validate signature, `aud`, `iss`, and `exp` claims on every request; return `401 Unauthorized` for invalid or missing tokens; bypass auth middleware when `WORKER_AUTH_ENABLED=false` (local dev mode); configure token scope (`api://<client-id>/Nexus.Access`); document the Entra app registration one-time setup (SPA type, redirect URI, `Nexus.Access` scope exposure).
- In: treat HTTPS via the shared Caddy origin as the default hosted deployment assumption for non-localhost URLs; keep the runtime configuration surface minimal (`ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `WORKER_AUTH_ENABLED`, `OPERATOR_ALLOWLIST`) rather than introducing a broader first-wave auth config matrix.
- Out: operator allowlist enforcement (item_086); hosted mode UI changes (item_087); Entra app registration itself (one-time admin action, not code).

# Acceptance criteria

- AC1: On a domain-joined Windows machine with Edge or Chrome, the app loads without a visible login prompt (silent SSO succeeds).
- AC2: On a non-domain machine or after token expiry, MSAL redirects to the Microsoft login page and returns the user to Nexus within 10 seconds after credential entry.
- AC3: The Python worker rejects requests with a missing or invalid token with `401 Unauthorized`. A valid token grants access to corpus and bishop endpoints.
- AC4: The JWKS is fetched at worker startup and cached; token validation is fully local on the worker — no call to the Entra introspection endpoint at runtime.
- AC5: In local dev mode (`WORKER_AUTH_ENABLED=false`), no token is required and no MSAL integration is active — `npm run dev` works without any Entra configuration.
- AC6: The `oid` (Entra object ID) claim is extracted from the validated token and made available to subsequent middleware for operator gating (item_086).

# Links

- Request: `logics/request/req_020_host_nexus_as_a_shared_multi_user_web_application.md`
- Product brief(s): `logics/product/prod_015_user_authentication_and_access_management.md`
- Architecture decision(s): `logics/architecture/adr_034_nexus_hosted_deployment_topology_and_multi_user_access_model.md`, `logics/architecture/adr_035_python_fastapi_as_the_worker_runtime.md`
- Depends on: `item_080_python_fastapi_worker_foundation`
- Task(s): `task_043_orchestrate_hosted_auth_access_and_deployment`

# Validation evidence

- Domain-joined Windows machine: open Nexus URL → app loads without login prompt
- Non-domain machine: open Nexus URL → redirect to Microsoft login → return to app
- `curl http://localhost:8000/api/corpus` (no token) → 401
- `curl -H "Authorization: Bearer <valid-token>" http://localhost:8000/api/corpus` → 200
- `WORKER_AUTH_ENABLED=false uvicorn worker.main:app` → `curl http://localhost:8000/api/corpus` → 200 (no token required)
- `python -m pytest worker/tests/test_auth.py -v`
