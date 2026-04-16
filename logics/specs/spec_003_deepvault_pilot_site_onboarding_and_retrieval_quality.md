## spec_003_deepvault_pilot_site_onboarding_and_retrieval_quality - DeepVault pilot site onboarding and retrieval quality
> From version: 0.0.2
> Understanding: 93%
> Confidence: 90%
> Related request: `logics/request/req_001_v1_local_hardening_and_scope_evolution.md`

# Overview
The pilot needs a repeatable way to add adjacent SharePoint sites and judge whether the retrieval path is still good.
This spec covers site onboarding, content priority, ranking signals, freshness, and the quality checks that keep the pilot honest as the scope expands.

# Goals
- Let new pilot sites be added without code changes.
- Keep retrieval quality measurable as the corpus grows.
- Make the ranking policy understandable to the team.

# Non-goals
- Broad tenant-wide onboarding.
- Building a full admin UI for site management.
- Solving every permissions edge case before the pilot is useful.

# Users & use cases
- Operators adding a new adjacent pilot site.
- Engineers checking whether ranking and freshness still look sensible.
- Reviewers validating that retrieval quality remains stable as scope expands.

# Scope
- In: config-driven site onboarding, content priority, ranking signals, and freshness checks.
- In: a small quality gate for the pilot corpus and query set.
- Out: unrelated content-management workflows and production admin tooling.

# Requirements
- The pilot site list must remain configurable without code changes.
- The retrieval flow must make documents, lists, pages, and metadata rank in a predictable order.
- The team must be able to compare freshness, relevance, and usefulness across the pilot set.
- The spec should support a small evaluation set that can be reused after new sites are added.

# Permission validation gate for new site onboarding

Before a new site is added to the pilot corpus, the following checks must pass. This prevents ingesting a site whose permission structure would silently bypass the V1 retrieval filter (which covers site-level and library-level only — item-level is deferred).

## Required checks before onboarding a site

| Check | How to verify | Failure action |
|---|---|---|
| Site uses standard permissions (no site-level broken inheritance) | `GET /sites/{site_id}/permissions` — confirm no custom item-level grants at the root | Do not onboard. Document the exception and escalate to the site owner. |
| All libraries in the site use inherited permissions (no broken inheritance at library level) | `GET /sites/{site_id}/drives` — check `uniquePermissions` on each drive | If any library has `uniquePermissions = true`, onboard only after adding it to the library-level check list in spec_005. |
| No files with item-level unique permissions exist in the libraries to be ingested | Spot-check 3–5 files in each library via `GET /sites/{site_id}/drives/{drive_id}/items/{item_id}/permissions` | If item-level unique permissions are found, exclude those files from ingestion (add their item IDs to an exclusion list) until item-level filtering is implemented. |
| Site is reachable with the ingestion service identity | `GET /sites/{site_id}` returns 200 with the service account | Do not onboard if the site is inaccessible to the ingestion identity. |

## Permission shape approval record

Each onboarded site must have a one-line entry in the `data/sites/onboarding_log.json` file:

```json
[
  {
    "site_id": "contoso.sharepoint.com,abc,def",
    "display_name": "Finance",
    "onboarded_at": "2026-04-10T00:00:00Z",
    "onboarded_by": "alice@contoso.com",
    "permission_shape": "site_inherited",
    "broken_inheritance_libraries": [],
    "item_exclusions": [],
    "notes": "Standard permissions. All libraries inherit from site."
  }
]
```

`permission_shape` values: `"site_inherited"` (all clean), `"library_mixed"` (some libraries have unique permissions — reviewed and approved), `"excluded_items"` (some files excluded pending item-level filtering).

A site MUST NOT be added to the `sites` table in the database without a corresponding entry in `onboarding_log.json`. This file is the audit record for site governance during V1.

# Acceptance criteria
- A new adjacent site can be added through configuration and validated without code changes.
- The ranking policy can be explained in simple terms to a reviewer.
- The pilot has a repeatable way to check whether retrieval quality is still acceptable.
- The spec gives enough guidance to keep onboarding low-risk and incremental.

# Validation / test plan
- Add or update a configured pilot site and confirm ingestion still works.
- Run a small retrieval evaluation set before and after onboarding a new site.
- Confirm the content priority order matches the agreed policy.
- Run `python3 logics/skills/logics-doc-linter/scripts/logics_lint.py --require-status`.

# Ranking tuning procedure

Ranking weights (defined in ADR 014) must not be changed before the evaluation baseline in task_008 is established. After baseline, follow this procedure if the pass rate falls below 80%:

1. **Diagnose before tuning.** For each failing query, identify the root cause: missing content (ingestion gap), wrong top chunk (ranking issue), or hallucinated answer (LLM issue). Tuning weights only fixes ranking issues.
2. **Minimum corpus threshold.** Do not tune weights if fewer than 5 sources are indexed per pilot site. Low chunk counts make ranking behavior unreliable.
3. **One signal at a time.** Change one weight at a time and re-run the full 20-query evaluation set. Do not adjust multiple weights simultaneously — it makes regression analysis impossible.
4. **Document every change.** Record the old weight, new weight, and the query IDs that motivated the change in `data/eval/ranking_tuning_log.json`.
5. **Retest gate.** After any weight change, the full 20-query set must be re-run and pass at ≥80% before the weight is considered stable.
6. **Freshness threshold.** If old-but-authoritative documents consistently rank too low (e.g., a policy doc from 2023 that is still canonical), adjust the freshness weight down (from 20% toward 15%) and transfer the difference to the structural weight. Document in the tuning log.

# Open questions
- ~~What freshness threshold should cause the pilot to fail a quality gate?~~ Resolved: see task_008 — freshness threshold is not a hard gate. Documents older than 90 days score 0.25 freshness but still rank if semantic relevance is high.

# References
- `logics/product/prod_000_sharepoint_knowledge_graph_product_vision.md`
- `logics/product/prod_001_local_first_development_and_test_strategy.md`
- `logics/product/prod_001_local_first_development_and_test_strategy.md`
- `logics/backlog/item_000_v1_graph_discovery_and_pilot_scope.md`
- `logics/backlog/item_001_v1_sharepoint_ingestion_and_sync_pipeline.md`
- `logics/backlog/item_002_v1_hybrid_knowledge_store_and_retrieval.md`
- `logics/architecture/adr_002_sharepoint_ingestion_and_sync_pipeline.md`
- `logics/architecture/adr_010_sharepoint_sync_orchestration_and_refresh_policy.md`
- `logics/architecture/adr_014_deepvault_retrieval_ranking_quality_and_cost_policy.md`
