## item_081_port_scoring_to_python_worker - Port document scoring to Python worker

> From version: 1.3.0
> Schema version: 1.0
> Status: Ready
> Understanding: 96%
> Confidence: 95%
> Progress: 0%
> Complexity: Medium
> Theme: Architecture / Quality
> Reminder: Update status, understanding, confidence, progress and linked request/task references when you edit this doc.

# Problem

- Document ranking and enrichment scoring currently lives in `src/lib/scoring.ts` (browser-side TypeScript).
- In the Python FastAPI model, scoring must run on the worker — it is called by the bishop proxy endpoint during corpus grounding.
- Keeping a TypeScript scoring implementation alongside a Python one would introduce divergence risk.

# Scope

- In: implement `worker/scoring.py` with the same document ranking logic as `scoring.ts` — static weights (title=8, summary=6, content=4, tags=5, path=2) with enrichment multipliers when AI keywords, AI summary, and confidence score are present (per `adr_032`); use functional parity rather than bit-perfect parity with the TypeScript path; port unit tests to `worker/tests/test_scoring.py`; verify that unenriched, high-confidence, and low-confidence documents produce the expected differential ranks.
- Out: changes to the scoring contract or weight values; semantic/vector retrieval; new provider integrations.
- Note: `src/lib/scoring.ts` is removed from the browser bundle in item_082 (corpus endpoint), not here — this item focuses on the Python implementation.

# Acceptance criteria

- AC1: `worker/scoring.py` implements document ranking with static weights and enrichment multipliers matching the contract defined in `adr_032`, including a fresh-analysis confidence threshold of `0.7` and a bounded enrichment bonus capped at `+15%` on the final score.
- AC2: Unit tests in `worker/tests/test_scoring.py` cover three cases: unenriched document, high-confidence enriched document, low-confidence enriched document — all three produce explainable differential ranks.
- AC3: The Python scoring output for equivalent input matches the TypeScript scoring output at the level that matters operationally: equivalent standard queries preserve the same relative ordering or an explainable near-equivalent ordering within a defined tolerance.

# Links

- Request: `logics/request/req_020_host_nexus_as_a_shared_multi_user_web_application.md`
- Product brief(s): (none — scoring is internal)
- Architecture decision(s): `logics/architecture/adr_035_python_fastapi_as_the_worker_runtime.md`, `logics/architecture/adr_032_integrate_analyze_enrichment_fields_into_bishop_retrieval_scoring.md`
- Related backlog: `item_077_integrate_analyze_enrichment_into_bishop_scoring.md` (enrichment scoring — now Python; see item_077 for scope)
- Task(s): `task_042_orchestrate_python_worker_foundation_and_runtime_migration`

# Validation evidence

- `python -m pytest worker/tests/test_scoring.py -v`
- Spot-check: run scoring against a sample corpus and compare with TypeScript output
