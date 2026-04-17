## adr_031_local_ai_usage_event_store_and_sectioned_ai_view - Local AI usage event store and sectioned AI View
> Date: 2026-04-17
> Status: Accepted
> Drivers: Separate answer review from token observability and retain bounded usage history locally.
> Related request: (none yet)
> Related backlog: `logics/backlog/item_071_ship_ai_usage_store_and_sectioned_ai_view.md`
> Related task: `logics/tasks/task_039_orchestrate_ai_consumption_observability_and_sectioned_ai_view.md`
> Reminder: Update status, linked refs, decision rationale, consequences, migration plan, and follow-up work when you edit this doc.

# Decision
- Persist a bounded append-only local usage-event store keyed by provider, model, status, usage kind, and token counts.
- Distinguish `provider`, `partial`, and `local` usage events instead of fabricating missing split values.
- Split `AI View` into `Answered` and `Tokens`, with the token section consuming daily/hourly rollups and provider summaries from the dedicated store.

# Consequences
- Token trends survive outside transient conversation state.
- The UI can show trustworthy usage rollups without mixing them into the answer-review layout.
