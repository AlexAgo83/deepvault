## item_071_ship_ai_usage_store_and_sectioned_ai_view - Ship AI usage store and sectioned AI View
> From version: 1.3.0
> Schema version: 1.0
> Status: Done
> Understanding: 97%
> Confidence: 95%
> Progress: 100%
> Complexity: Medium
> Theme: Product / Architecture
> Reminder: Update status, understanding, confidence, progress and linked request/task references when you edit this doc.

# Problem
- `AI View` mixed response review with consumption visibility and had no dedicated retained token event history.
- Operators could not inspect daily/hourly usage or provider splits without external logs.

# Scope
- In: a local dedicated usage-event store, per-response token logging, daily/hourly rollups, and `Answered` / `Tokens` sections inside `AI View`.
- Out: estimated cost billing, per-model finance analytics, or prompt archival.

# Acceptance criteria
- AC1: The app persists bounded token events separately from transient message state.
- AC2: `AI View` exposes `Answered` and `Tokens` as distinct sections.
- AC3: `Tokens` shows first-wave KPIs, daily trend, hourly distribution, and provider summaries.

# Links
- Product brief(s): `logics/product/prod_012_add_ai_consumption_observability_and_sectioned_ai_view.md`
- Architecture decision(s): `logics/architecture/adr_031_local_ai_usage_event_store_and_sectioned_ai_view.md`
- Task(s): `logics/tasks/task_039_orchestrate_ai_consumption_observability_and_sectioned_ai_view.md`

# Validation evidence
- `rtk npm run test -- tests/ai-stats-panel.spec.tsx tests/use-bishop-conversation.spec.tsx tests/app.spec.tsx`
- `rtk npm run check`
