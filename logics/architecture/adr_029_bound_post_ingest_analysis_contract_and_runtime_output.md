## adr_029_bound_post_ingest_analysis_contract_and_runtime_output - Bound post-ingest analysis contract and runtime output
> Date: 2026-04-17
> Status: Accepted
> Drivers: Add a separate enrichment path after ingest without destabilizing the baseline corpus contract.
> Related request: (none yet)
> Related backlog: `logics/backlog/item_069_ship_bounded_post_ingest_analysis_command.md`
> Related task: `logics/tasks/task_037_orchestrate_post_ingest_ai_analysis_command_for_corpus_enrichment.md`
> Reminder: Update status, linked refs, decision rationale, consequences, migration plan, and follow-up work when you edit this doc.

# Decision
- Add an optional `document.analysis` block with versioned additive fields instead of overwriting the baseline document contract.
- Ship the first runtime output as `data/runtime/analyzed-corpus.json`.
- Keep deterministic selection and persisted `excluded` / `stale` reasons inside the analysis block.
- Let retrieval prefer `analysis.summary`, `analysis.sections`, and `analysis.keywords` only when the analysis status is fresh enough to trust.

# Consequences
- Baseline ingest remains safe and queryable without the analysis path.
- Downstream consumers gain stronger summaries and structure without losing raw evidence.
- The first shipped command can evolve from local heuristics toward provider-backed enrichment without breaking the additive schema.
