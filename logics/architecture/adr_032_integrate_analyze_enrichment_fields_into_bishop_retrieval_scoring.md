## adr_032_integrate_analyze_enrichment_fields_into_bishop_retrieval_scoring - Integrate analyze enrichment fields into Bishop retrieval scoring

> Date: 2026-04-18
> Status: Accepted
> Drivers: Close the loop between the analyze pipeline and Bishop answer quality by feeding enriched fields into retrieval scoring without breaking the static-weight fallback for unenriched documents.
> Related request: `logics/request/req_019_post_v1_3_consolidation_enrichment_loop_ci_and_configuration_portability.md`
> Related backlog: `logics/backlog/item_077_integrate_analyze_enrichment_into_bishop_scoring.md`
> Related task: `logics/tasks/task_041_orchestrate_post_v1_3_consolidation_enrichment_ci_and_configuration_portability.md`
> Reminder: Update status, linked refs, decision rationale, consequences, migration plan, and follow-up work when you edit this doc.

# Overview

The `analyze` pipeline enriches each document with an AI summary, extracted keywords, and a confidence score. These fields are now consumed by worker-side retrieval scoring through `worker/scoring.py`, with a bounded confidence boost and a static fallback for unenriched documents. This ADR records the scoring contract and fallback behavior for documents that have not been analyzed.

```mermaid
%% logics-kind: architecture
%% logics-signature: architecture|integrate-analyze-enrichment-fields-into-bi|item-077-integrate-analyze-enrichment-into|static-weights-ignore-enrichment|prefer-enriched-fields-when-analysis-sta
flowchart LR
    Current[Static weights ignore enrichment] --> Decision[Prefer enriched fields when analysis status is fresh]
    Decision --> Scoring[worker/scoring.py uses analysis.keywords and analysis.summary]
    Decision --> Fallback[Static weights remain for unenriched documents]
    Decision --> Gate[evaluate gate validates no regression]
```

# Context

- `adr_029` established that retrieval should prefer `analysis.summary`, `analysis.sections`, and `analysis.keywords` only when the analysis status is fresh enough to trust — but the actual scoring integration was deferred.
- `worker/scoring.py` applies fixed weights for title, summary, sections, content, tags, path, author, and file type. Those weights need an explicit enrichment branch so analyzed documents can benefit from stronger summaries and keywords without losing the deterministic fallback path.
- `publish-analyzed-corpus` produces a corpus where enriched documents carry an `analysis` block with `status`, `summary`, `keywords`, and `confidence`. The confidence score is a provider-backed signal about extraction quality.
- The shipped analyze pipeline writes `analysis.confidence` on a `55..95` scale, while some earlier tests and transitional fixtures used a `0..1` ratio. The scoring path must normalize both formats before applying the threshold and bonus.
- Documents without an analysis block, or with a status other than a fresh analyzed state, should fall back to the existing static-weight path unchanged.

# Decision

- When a document carries an `analysis` block with a fresh status and a confidence score above a minimum threshold, prefer `analysis.summary` over the raw corpus summary field for scoring and prefer `analysis.keywords` over the raw tags field.
- Apply a confidence multiplier to the computed score of enriched documents so that a high-confidence analyzed document ranks above an equivalent unenriched one at the same keyword match level.
- The confidence multiplier is additive and bounded to avoid over-boosting: a document with max confidence should rank meaningfully higher than its unenriched equivalent but should not dominate results purely on enrichment status.
- Keep the static-weight path fully intact for documents without an analysis block or with a non-fresh analysis status. Enrichment is a signal boost, not a prerequisite for retrieval.
- Document the multiplier and threshold values in `worker/scoring.py` with explicit inline comments so the weighting rationale is visible without reading this ADR.
- The evaluate gate must pass after the change: no regression on baseline mock retrieval quality.

# Alternatives considered

- **Ignore enrichment in scoring entirely**: simple but wastes the investment in the analyze pipeline; does not close the quality loop.
- **Replace static weights with a fully dynamic enrichment-driven model**: too much complexity for the first integration; loses the deterministic fallback guarantee.
- **Use enrichment as a filter rather than a boost**: excludes unenriched documents from some results, which would break retrieval for corpora that have not been analyzed.

# Consequences

- Bishop answer quality improves for corpora that have been analyzed, especially for documents with weak raw extraction but strong AI summaries.
- Unenriched corpora continue to work exactly as before — the static-weight path is unchanged.
- The scoring module becomes slightly more complex but the enrichment branch is explicitly conditional and testable in isolation.
- The evaluate gate provides a regression safety net to catch any unintended ranking changes on the mock baseline.

# Migration and rollout

- Validate that the `confidence` field and enriched fields are present and stable in a published analyzed corpus before modifying scoring.
- Add three-case unit tests (unenriched, high-confidence, low-confidence) before changing the production scoring path.
- Run `npm run evaluate` against the mock baseline after the change to confirm no regression.
- Keep the confidence threshold and multiplier as named constants in `worker/scoring.py` so they can be adjusted without hunting for magic numbers.
- Validate the shipped implementation with `rtk python3 -m pytest worker/tests/test_scoring.py -q`, `rtk npm run typecheck`, and `rtk npm run evaluate`.

# References

- `logics/architecture/adr_014_deepvault_retrieval_ranking_quality_and_cost_policy.md`
- `logics/architecture/adr_029_bound_post_ingest_analysis_contract_and_runtime_output.md`
- `logics/product/prod_010_add_a_post_ingest_ai_analysis_command_for_corpus_enrichment.md`

# Follow-up work

- Consider surfacing the enrichment status of a document in the Explorer card or Artifacts panel so operators know which sources have been boosted.
- Re-evaluate the confidence threshold and multiplier after the first real corpus analyze run to calibrate against actual provider-backed scores.
