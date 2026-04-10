## spec_003_deepvault_pilot_site_onboarding_and_retrieval_quality - DeepVault pilot site onboarding and retrieval quality
> From version: 0.0.2
> Understanding: 93%
> Confidence: 90%

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

# Open questions
- What freshness threshold should cause the pilot to fail a quality gate?

# References
- `logics/product/prod_000_sharepoint_knowledge_graph_product_vision.md`
- `logics/product/prod_001_local_first_development_and_test_strategy.md`
- `logics/product/prod_002_hosted_production_strategy_with_teams_at_the_end.md`
- `logics/backlog/item_000_graph_discovery_and_pilot_scope.md`
- `logics/backlog/item_001_sharepoint_ingestion_and_sync_pipeline.md`
- `logics/backlog/item_002_hybrid_knowledge_store_and_retrieval.md`
- `logics/architecture/adr_002_sharepoint_ingestion_and_sync_pipeline.md`
- `logics/architecture/adr_010_sharepoint_sync_orchestration_and_refresh_policy.md`
- `logics/architecture/adr_014_deepvault_retrieval_ranking_quality_and_cost_policy.md`
