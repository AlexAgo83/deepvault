## spec_004_deepvault_data_schema_and_storage_contracts - DeepVault data schema and storage contracts
> From version: 0.0.1
> Understanding: 95%
> Confidence: 93%

# Overview
This spec defines the concrete data structures used by DeepVault across all storage layers.
It covers the SQLite relational schema for local development, the blob file layout for derived content, and the JSON shape of chunks passed to the retrieval layer.
All fields defined here are the shared contract between ingestion, retrieval, and the chat backend.

# Goals
- Give engineers a single reference for field names, types, and nullability.
- Prevent schema drift between ingestion, retrieval, and the audit layer.
- Enable the V1 → V2 migration by defining a stable schema that maps cleanly onto Azure services.

# Non-goals
- Defining SharePoint data structures (those are owned by Microsoft Graph).
- Specifying the vector embedding format (that is internal to the retrieval engine).
- Documenting every intermediate processing format — only the persisted contracts matter here.

# Relational schema (SQLite local / Azure SQL hosted)

## Table: `sites`
Stores the configured pilot sites that DeepVault is allowed to ingest.

```sql
CREATE TABLE sites (
    site_id         TEXT PRIMARY KEY,           -- SharePoint site ID from Graph (e.g. "contoso.sharepoint.com,abc123,def456")
    display_name    TEXT NOT NULL,              -- Human-readable site name
    site_url        TEXT NOT NULL,              -- Full SharePoint site URL
    enabled         INTEGER NOT NULL DEFAULT 1, -- 1 = active, 0 = disabled (not ingested)
    added_at        TEXT NOT NULL,              -- ISO 8601 UTC timestamp
    added_by        TEXT NOT NULL               -- UPN of the operator who added the site
);
```

## Table: `sync_state`
Tracks per-source incremental sync progress and retry state.

```sql
CREATE TABLE sync_state (
    source_id       TEXT PRIMARY KEY,           -- Composite ID: "{site_id}:{drive_id}:{item_id}" or "{site_id}:{list_id}"
    source_type     TEXT NOT NULL,              -- "document", "list", "page", "library"
    site_id         TEXT NOT NULL REFERENCES sites(site_id),
    last_sync_at    TEXT,                       -- ISO 8601 UTC timestamp of last successful sync. NULL if never synced.
    last_modified   TEXT,                       -- SharePoint last-modified timestamp of the source at last sync
    etag            TEXT,                       -- SharePoint ETag at last sync, for delta detection
    sync_status     TEXT NOT NULL DEFAULT 'pending', -- "pending", "synced", "sync_failed", "not_found", "checkpoint_reset"
    retry_count     INTEGER NOT NULL DEFAULT 0, -- Number of consecutive failed attempts
    error_message   TEXT,                       -- Last error message if sync_status = "sync_failed"
    watermark       TEXT,                       -- Opaque Graph delta token or cursor for incremental continuation
    updated_at      TEXT NOT NULL               -- ISO 8601 UTC timestamp of last row update
);
```

## Table: `audit_events`
Stores bounded audit entries for retrieval runs, permission denials, and provider selections. Not for raw application logs.

```sql
CREATE TABLE audit_events (
    event_id        TEXT PRIMARY KEY,           -- UUID v4
    event_type      TEXT NOT NULL,              -- "retrieval_run", "permission_denied", "provider_selected", "sync_run", "sync_failed"
    user_upn        TEXT,                       -- UPN of the user who triggered the event. NULL for system events.
    session_id      TEXT,                       -- Chat or sync session identifier
    site_id         TEXT,                       -- Site context if applicable
    source_ids      TEXT,                       -- JSON array of source IDs included in a retrieval run. NULL for non-retrieval events.
    provider        TEXT,                       -- "openai" or "gemini". NULL for non-LLM events.
    token_count     INTEGER,                    -- Context token count for retrieval_run events
    chunk_count     INTEGER,                    -- Number of chunks assembled for retrieval_run events
    exclusion_count INTEGER,                    -- Number of sources excluded by permission filter
    outcome         TEXT NOT NULL,              -- "success", "denied", "failed", "fallback"
    detail          TEXT,                       -- Brief structured detail (max 500 chars). No raw tokens, no secret values.
    created_at      TEXT NOT NULL               -- ISO 8601 UTC timestamp
);
```

## Table: `permission_cache`
Short-lived permission resolution cache. TTL enforced by the application, not the database.

```sql
CREATE TABLE permission_cache (
    cache_key       TEXT PRIMARY KEY,           -- "{user_upn}:{site_id}" or "{user_upn}:{site_id}:{container_id}"
    permitted       INTEGER NOT NULL,           -- 1 = allowed, 0 = denied
    resolved_at     TEXT NOT NULL,              -- ISO 8601 UTC timestamp of resolution
    expires_at      TEXT NOT NULL               -- ISO 8601 UTC timestamp after which the cache entry must not be used
);
```

# Blob file layout

Local: `data/` directory relative to the runtime root.
Hosted: Azure Blob Storage containers as named below.

```
data/
├── extracts/                         # Raw text extracted from SharePoint content
│   └── {site_id}/
│       └── {source_id}.json          # One file per source item
├── chunks/                           # Chunked passages ready for indexing
│   └── {site_id}/
│       └── {source_id}/
│           └── {chunk_index:04d}.json  # e.g. 0000.json, 0001.json
└── audit/                            # Audit log exports (append-only)
    └── {YYYY-MM-DD}.jsonl            # One JSONL file per day
```

Azure Blob containers:
- `deepvault-extracts` → mirrors `data/extracts/`
- `deepvault-chunks` → mirrors `data/chunks/`
- `deepvault-audit` → mirrors `data/audit/`

# Extract file schema (`extracts/{site_id}/{source_id}.json`)

```json
{
  "source_id": "contoso.sharepoint.com,abc,def:drive123:item456",
  "source_type": "document",
  "site_id": "contoso.sharepoint.com,abc,def",
  "display_name": "Q3 2025 Budget Review.docx",
  "site_url": "https://contoso.sharepoint.com/sites/Finance",
  "library_path": "/sites/Finance/Shared Documents/FY2025",
  "author": "alice@contoso.com",
  "last_modified": "2025-09-14T10:32:00Z",
  "content_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "extracted_at": "2026-04-10T02:05:00Z",
  "text": "<full plain-text extraction of the document content>"
}
```

Fields:
| Field | Type | Nullable | Description |
|---|---|---|---|
| `source_id` | string | No | Composite unique ID matching `sync_state.source_id` |
| `source_type` | string | No | `"document"`, `"list"`, `"page"`, or `"library"` |
| `site_id` | string | No | SharePoint site ID |
| `display_name` | string | No | File or item display name |
| `site_url` | string | No | Full SharePoint site URL |
| `library_path` | string | Yes | Relative path within the library. Null for list items. |
| `author` | string | Yes | UPN of the author. Null if not available from Graph. |
| `last_modified` | string | No | ISO 8601 UTC timestamp from SharePoint |
| `content_type` | string | Yes | MIME type of the source. Null for list items. |
| `extracted_at` | string | No | ISO 8601 UTC timestamp when text was extracted |
| `text` | string | No | Full plain-text content. No HTML, no markdown. Whitespace normalized. |

# Chunk file schema (`chunks/{site_id}/{source_id}/{chunk_index}.json`)

```json
{
  "chunk_id": "contoso.sharepoint.com,abc,def:drive123:item456:0003",
  "source_id": "contoso.sharepoint.com,abc,def:drive123:item456",
  "source_type": "document",
  "site_id": "contoso.sharepoint.com,abc,def",
  "chunk_index": 3,
  "text": "<chunk text, max 512 tokens, 64-token overlap with adjacent chunks>",
  "token_count": 487,
  "display_name": "Q3 2025 Budget Review.docx",
  "library_path": "/sites/Finance/Shared Documents/FY2025",
  "author": "alice@contoso.com",
  "last_modified": "2025-09-14T10:32:00Z",
  "source_type_weight": 0.9,
  "chunked_at": "2026-04-10T02:06:00Z"
}
```

Fields:
| Field | Type | Nullable | Description |
|---|---|---|---|
| `chunk_id` | string | No | `"{source_id}:{chunk_index}"` — globally unique |
| `source_id` | string | No | Parent source. Used to trace the chunk back to the extract and to `sync_state`. |
| `source_type` | string | No | Inherited from the extract |
| `site_id` | string | No | Inherited from the extract. Used for permission filtering. |
| `chunk_index` | integer | No | Zero-based position within the source |
| `text` | string | No | Chunk text. Max 512 tokens. |
| `token_count` | integer | No | Actual token count of this chunk |
| `display_name` | string | No | Inherited from the extract. Used for citations. |
| `library_path` | string | Yes | Inherited from the extract. Used for citations. |
| `author` | string | Yes | Inherited from the extract |
| `last_modified` | string | No | Inherited from the extract. Used for freshness scoring. |
| `source_type_weight` | float | No | Pre-computed structural weight: document=1.0, page=0.8, list=0.6, metadata-only=0.3 |
| `chunked_at` | string | No | ISO 8601 UTC timestamp when the chunk was produced |

# Schema versioning

The schema must be versioned so changes can be applied safely during V1 development and during the V1 → V2 migration.

## Version tracking

A `schema_migrations` table tracks which migrations have been applied:

```sql
CREATE TABLE schema_migrations (
    version     INTEGER PRIMARY KEY,  -- Sequential migration number (1, 2, 3...)
    applied_at  TEXT NOT NULL,        -- ISO 8601 UTC timestamp
    description TEXT NOT NULL         -- One-line description of the change
);
```

The current V1 schema is version 1. Every structural change (add column, rename table, add index) requires a new migration with an incremented version number.

## Rules for schema changes

| Change type | Safe to apply? | Procedure |
|---|---|---|
| Add nullable column with default | Yes | Add migration. Existing rows get the default. No data loss. |
| Add non-nullable column | Only with a default value | Add migration with `DEFAULT` clause. |
| Rename column | No — breaking | Add new column, backfill, then remove old column in a later migration. Never rename directly. |
| Drop column | Only if unused | Verify no code reads the column before dropping. |
| Change column type | No — breaking | Add new column with new type, migrate data, remove old column. |
| Add index | Yes | Non-blocking. Apply as a separate migration. |

## V1 → V2 migration contract

The SQLite schema exported for Azure SQL migration must be at the same version as the local schema at migration time. Before running the migration:

1. Record the current `MAX(version)` from `schema_migrations`.
2. Apply all pending migrations to the local SQLite database first.
3. Export the schema and data at that version.
4. Import into Azure SQL using the same migration scripts — do not use SQLite dumps directly (type compatibility differs).
5. After import, run `SELECT MAX(version) FROM schema_migrations` on Azure SQL and confirm it matches the local value.

If a new field is needed that does not exist in the V1 schema, add it as a nullable column with a default before migration. Never add a required field during migration.

# Validation / test plan
- Run a schema migration script against SQLite and verify all tables create without error.
- Ingest one document and confirm the extract file matches the schema above.
- Chunk the document and confirm each chunk file matches the schema above.
- Verify `chunk_id` uniqueness across all chunk files for a given source.
- Run `python3 logics/skills/logics-doc-linter/scripts/logics_lint.py --require-status`.

# References
- `logics/architecture/adr_003_hybrid_knowledge_store_and_retrieval_model.md`
- `logics/architecture/adr_010_sharepoint_sync_orchestration_and_refresh_policy.md`
- `logics/architecture/adr_014_deepvault_retrieval_ranking_quality_and_cost_policy.md`
- `logics/architecture/adr_015_deepvault_security_audit_logging_and_retention_boundaries.md`
- `logics/architecture/adr_016_deepvault_persistence_and_storage_layout.md`
- `logics/tasks/task_007_v2_operations_runbook_and_release_readiness.md`
