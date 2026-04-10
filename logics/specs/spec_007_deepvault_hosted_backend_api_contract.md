## spec_007_deepvault_hosted_backend_api_contract - DeepVault hosted backend API contract
> From version: 0.0.1
> Understanding: 95%
> Confidence: 93%
> Related request: `logics/request/req_002_v2_azure_and_teams_foundation.md`

# Overview
This spec defines the HTTP API contract for the DeepVault hosted backend.
It covers all endpoints consumed by `DeepVault - Bishop` (local chat), `DeepVault - Gordon` (Teams bot), and `DeepVault - Navy` (sync status and explorer). It also documents auth headers, error shapes, and rate limit behavior.
This contract is the shared boundary between frontend surfaces and the backend. Any surface that calls the backend must conform to this spec. The backend must not expose undocumented behavior.

# Goals
- Give engineers a complete, implementation-ready API reference before task_003 starts.
- Prevent API drift between Bishop, Gordon, and the hosted backend.
- Define error shapes precisely so surfaces can render failures consistently.

# Non-goals
- Internal backend service-to-service calls (Graph API, Azure SQL, AI Search).
- WebSocket or streaming responses (deferred to post-V1).
- Admin or operator-only management API (out of scope for V1).

# Authentication

All requests must include a valid Entra (Microsoft) access token in the `Authorization` header:

```
Authorization: Bearer <entra_access_token>
```

The access token is the delegated user token obtained via MSAL (device code flow for Navy, OBO flow for Gordon via Teams). The backend validates the token against the configured Entra tenant before processing any request. Requests without a valid token receive `401 Unauthorized`.

The backend uses the identity in the token for permission checks. It does not accept service tokens or anonymous requests on any chat or retrieval endpoint.

## Entra app registration requirements

The hosted backend requires one app registration in Entra with the following configuration:

| Setting | Value |
|---|---|
| Application type | Web API |
| Display name | `DeepVault Backend` |
| Supported account types | Accounts in this organizational directory only (single tenant) |
| API permissions (delegated) | `Sites.Read.All`, `Files.Read.All`, `User.Read` |
| Exposed API scope | `DeepVault.Chat` — granted to Navy and Gordon client apps |
| Exposed API role | `DeepVault.Operator` — assigned to operators via Entra group or direct role assignment |

## DeepVault.Operator scope

`DeepVault.Operator` is an **app role** (not a delegated scope) defined on the `DeepVault Backend` app registration. It gates access to the `POST /sync/trigger` endpoint.

To assign the Operator role to a user:
1. Go to Entra ID → Enterprise Applications → `DeepVault Backend`.
2. Select "Users and groups" → "Add user/group".
3. Assign the `DeepVault.Operator` role to the operator's user account or Entra security group.

When an operator authenticates, their token contains the role claim `roles: ["DeepVault.Operator"]`. The backend checks for this claim before processing any `/sync/trigger` request.

Users without the role assignment receive `403 insufficient_scope` on `/sync/trigger` even with a valid token.

---

# Endpoints

## POST /chat/query

Submits a user question and returns a grounded answer with citations.

**Request**

```json
{
  "question": "What is the onboarding process for new employees?",
  "session_id": "sess_abc123",
  "site_filter": ["contoso.sharepoint.com,abc,def"]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `question` | string | Yes | The user question. Max 500 tokens. |
| `session_id` | string | Yes | Client-generated session ID for audit traceability. UUID v4 recommended. |
| `site_filter` | array of strings | No | Optional list of `site_id` values to restrict retrieval. If omitted, all permitted sites are queried. |

**Response 200 — answer returned**

```json
{
  "answer": "The onboarding process includes four steps: account setup [1], equipment provisioning [1], HR orientation [2], and team introduction [2].",
  "sources": [
    {
      "index": 1,
      "chunk_id": "contoso.sharepoint.com,abc,def:drive123:item456:0003",
      "display_name": "Employee Onboarding Guide.docx",
      "site_url": "https://contoso.sharepoint.com/sites/HR",
      "library_path": "/sites/HR/Shared Documents/Guides",
      "last_modified": "2025-11-01T09:00:00Z",
      "author": "alice@contoso.com"
    },
    {
      "index": 2,
      "chunk_id": "contoso.sharepoint.com,abc,def:drive123:item789:0001",
      "display_name": "New Hire Checklist.docx",
      "site_url": "https://contoso.sharepoint.com/sites/HR",
      "library_path": "/sites/HR/Shared Documents/Guides",
      "last_modified": "2026-01-15T14:30:00Z",
      "author": "bob@contoso.com"
    }
  ],
  "provider": "openai",
  "token_count": 3840,
  "chunk_count": 8,
  "session_id": "sess_abc123"
}
```

**Response 200 — no permitted sources**

```json
{
  "answer": "No accessible content was found for your query.",
  "sources": [],
  "type": "no_permitted_sources",
  "provider": null,
  "token_count": 0,
  "chunk_count": 0,
  "session_id": "sess_abc123"
}
```

**Response 200 — partial access**

```json
{
  "answer": "Based on accessible content: ...",
  "sources": [...],
  "type": "partial_access",
  "exclusion_count": 4,
  "provider": "openai",
  "token_count": 2100,
  "chunk_count": 5,
  "session_id": "sess_abc123"
}
```

**Error responses**

| HTTP status | `type` field | Condition |
|---|---|---|
| 400 | `question_too_long` | Question exceeds 500 tokens |
| 400 | `invalid_session_id` | `session_id` is missing or malformed |
| 401 | `unauthorized` | Missing or invalid Entra token |
| 403 | `permission_check_failed` | Graph API unavailable during permission resolution |
| 429 | `rate_limited` | More than 10 requests per minute per user |
| 500 | `provider_error` | LLM provider failed after retries |
| 500 | `assembly_error` | Internal context assembly error |

Error response shape (all 4xx/5xx):

```json
{
  "type": "question_too_long",
  "message": "Your question is too long. Please shorten it and try again.",
  "session_id": "sess_abc123"
}
```

---

## GET /sources/{chunk_id}

Returns the metadata for a specific chunk, used by surfaces to render citation detail panels.

**Path parameter**: `chunk_id` — the chunk ID from a `sources` entry in a `/chat/query` response.

**Request**: no body, auth header required.

**Response 200**

```json
{
  "chunk_id": "contoso.sharepoint.com,abc,def:drive123:item456:0003",
  "source_id": "contoso.sharepoint.com,abc,def:drive123:item456",
  "display_name": "Employee Onboarding Guide.docx",
  "site_url": "https://contoso.sharepoint.com/sites/HR",
  "library_path": "/sites/HR/Shared Documents/Guides",
  "author": "alice@contoso.com",
  "last_modified": "2025-11-01T09:00:00Z",
  "content_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "chunk_index": 3,
  "text_preview": "The onboarding process begins with account setup in the first 24 hours...",
  "sharepoint_url": "https://contoso.sharepoint.com/sites/HR/Shared%20Documents/Guides/Employee%20Onboarding%20Guide.docx"
}
```

`text_preview` is the first 200 characters of the chunk text. It is not the full chunk.
`sharepoint_url` is a direct link to open the document in SharePoint.

**Error responses**

| HTTP status | `type` field | Condition |
|---|---|---|
| 401 | `unauthorized` | Missing or invalid token |
| 403 | `access_denied` | User does not have access to the site containing this chunk |
| 404 | `chunk_not_found` | Chunk ID does not exist in the index |

---

## GET /sync/status

Returns the current sync state for all configured sites. Used by Navy's sync status view.

**Request**: no body, auth header required. Any authenticated user can call this endpoint — it does not expose content, only sync metadata.

**Response 200**

```json
{
  "sites": [
    {
      "site_id": "contoso.sharepoint.com,abc,def",
      "display_name": "Finance",
      "site_url": "https://contoso.sharepoint.com/sites/Finance",
      "last_sync_at": "2026-04-10T02:05:00Z",
      "sync_status": "synced",
      "source_count": 142,
      "chunk_count": 1847,
      "sync_failed_count": 0
    },
    {
      "site_id": "contoso.sharepoint.com,ghi,jkl",
      "display_name": "HR",
      "site_url": "https://contoso.sharepoint.com/sites/HR",
      "last_sync_at": "2026-04-10T02:06:00Z",
      "sync_status": "sync_failed",
      "source_count": 87,
      "chunk_count": 1102,
      "sync_failed_count": 3
    }
  ],
  "last_full_sync_at": "2026-04-10T02:10:00Z",
  "next_scheduled_sync_at": "2026-04-11T02:00:00Z"
}
```

`sync_status` values per site: `"synced"`, `"syncing"`, `"sync_failed"`, `"pending"`.

---

## POST /sync/trigger

Triggers a manual incremental sync for one or all configured sites. Operator use only — requires a scope claim in the token (`DeepVault.Operator`).

**Request**

```json
{
  "site_id": "contoso.sharepoint.com,abc,def"
}
```

`site_id` is optional. If omitted, triggers a sync for all enabled sites.

**Response 202 — sync accepted**

```json
{
  "message": "Sync triggered.",
  "site_id": "contoso.sharepoint.com,abc,def",
  "triggered_at": "2026-04-10T10:00:00Z"
}
```

**Error responses**

| HTTP status | `type` field | Condition |
|---|---|---|
| 401 | `unauthorized` | Missing or invalid token |
| 403 | `insufficient_scope` | Token does not have `DeepVault.Operator` scope |
| 404 | `site_not_found` | `site_id` not in configured site list |
| 409 | `sync_already_running` | A sync for this site is already in progress |

---

# Rate limits

| Endpoint | Limit | Scope |
|---|---|---|
| `POST /chat/query` | 10 requests/minute | Per user (by UPN from token) |
| `GET /sources/{chunk_id}` | 60 requests/minute | Per user |
| `GET /sync/status` | 30 requests/minute | Per user |
| `POST /sync/trigger` | 5 requests/hour | Per operator |

Clients that exceed limits receive `429 Too Many Requests` with a `Retry-After` header (seconds to wait).

---

# Response headers

All responses include:

| Header | Value | Description |
|---|---|---|
| `Content-Type` | `application/json` | Always JSON |
| `X-Request-Id` | UUID v4 | Unique ID for this request, present in audit logs |
| `X-Session-Id` | session_id from request | Echo of the client session ID |

---

# Versioning

The API is unversioned in V1. Breaking changes require a new major version prefix (e.g., `/v2/chat/query`). Adding new optional fields to response bodies is non-breaking. Removing or renaming fields requires a version bump. In V1, no versioning prefix is used — the implicit version is v1.

---

# Acceptance criteria
- All four endpoints return the documented shapes for happy-path requests.
- All documented error types return the correct HTTP status and `type` field.
- `POST /chat/query` never returns an answer when the user has no permitted sources.
- `GET /sources/{chunk_id}` returns 403 if the user cannot access the chunk's parent site.
- `POST /sync/trigger` returns 403 if the token does not have the `DeepVault.Operator` scope.
- Rate limits are enforced and `429` is returned with a `Retry-After` header.

# Validation / test plan
- Run integration tests against each endpoint with a valid token and confirm 200 shapes.
- Run each error case with the correct failure condition and confirm the documented status and `type`.
- Confirm `POST /chat/query` with a denied-user token returns `no_permitted_sources`, not an answer.
- Confirm `POST /sync/trigger` with a non-operator token returns `403 insufficient_scope`.
- Run `python3 logics/skills/logics-doc-linter/scripts/logics_lint.py --require-status`.

# References
- `logics/architecture/adr_001_identity_and_access_model_for_sharepoint_knowledge_graph.md`
- `logics/architecture/adr_004_teams_bot_architecture_for_llm_chat.md`
- `logics/architecture/adr_008_llm_provider_abstraction_for_openai_and_gemini.md`
- `logics/architecture/adr_009_permission_aware_retrieval_and_source_filtering.md`
- `logics/architecture/adr_013_hosted_backend_and_teams_chat_channel.md`
- `logics/specs/spec_002_deepvault_bishop_chat_flow_and_answer_quality.md`
- `logics/specs/spec_005_deepvault_permission_mapping_and_retrieval_filters.md`
- `logics/specs/spec_006_deepvault_prompt_and_context_assembly.md`
- `logics/tasks/task_003_hosted_backend_core_delivery.md`
- `logics/tasks/task_004_teams_channel_and_permissions_delivery.md`
