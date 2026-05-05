## adr_029_bound_post_ingest_analysis_contract_and_runtime_output - Bound post-ingest analysis contract and runtime output
> Date: 2026-05-05
> Status: Accepted
> Drivers: Add a separate enrichment path after ingest without destabilizing the baseline corpus contract, and ensure analysis consumes extract-backed body text instead of metadata-only placeholders.
> Related request: (none yet)
> Related request: `logics/request/req_021_enforce_real_text_extraction_before_post_ingest_analysis.md`
> Related backlog: `logics/backlog/item_069_ship_bounded_post_ingest_analysis_command.md`, `logics/backlog/item_091_analyze_pipeline_uses_extract_backed_text.md`
> Related task: `logics/tasks/task_037_orchestrate_post_ingest_ai_analysis_command_for_corpus_enrichment.md`, `logics/tasks/task_044_orchestrate_extract_backed_analysis_pipeline.md`
> Reminder: Updated for extract-backed analysis input; keep status, linked refs, decision rationale, consequences, migration plan, and follow-up work in sync when analysis input or runtime reports change.

# Decision
- Add an optional `document.analysis` block with versioned additive fields instead of overwriting the baseline document contract.
- Ship the first runtime output as `data/runtime/analyzed-corpus.json`.
- Keep deterministic selection and persisted `excluded` / `stale` reasons inside the analysis block.
- Resolve analysis input from durable extract artifacts before corpus content, and exclude `metadata_only` / `unreadable` placeholders from substantive provider or local analysis.
- Include extraction-quality run metrics in `data/runtime/analyze-report.json`.
- Let retrieval prefer `analysis.summary`, `analysis.sections`, and `analysis.keywords` only when the analysis status is fresh enough to trust.

# Consequences
- Baseline ingest remains safe and queryable without the analysis path.
- Downstream consumers gain stronger summaries and structure without losing raw evidence.
- The first shipped command can evolve from local heuristics toward provider-backed enrichment without breaking the additive schema.
- Metadata-only corpus rows remain traceable and searchable, but they no longer create plausible analysis summaries from `Source:` / `Path:` placeholders.
