## spec_002_deepvault_bishop_chat_flow_and_answer_quality - DeepVault Bishop chat flow and answer quality
> From version: 0.0.2
> Understanding: 95%
> Confidence: 92%
> Related request: `logics/request/req_000_v0_bootstrap_and_initial_foundations.md`

# Overview
`DeepVault - Bishop` is the local question-answering surface for DeepVault.
It should make it easy to ask a question, inspect the answer, and trust the sources behind it.
The spec covers answer flow, citations, loading and error states, and the quality signals needed to judge whether the chat is useful.

# Goals
- Deliver a source-backed local chat surface.
- Keep the answer flow permission-aware and provider-agnostic.
- Make answer quality measurable during local validation.

# Non-goals
- Teams packaging.
- Admin console work.
- Fine-tuning or prompt experiments that are not needed for the first useful flow.

# Users & use cases
- Engineers testing retrieval and answer quality.
- Reviewers checking whether answers cite the right source material.
- Local users comparing provider behavior without changing the UI.

# Scope
- In: question input, answer rendering, citations, source preview, retry, and empty or denied states.
- In: provider-agnostic calls to the LLM backend contract.
- In: local quality checks for grounding, permissions, and answer usefulness.
- Out: Teams delivery, hosted deployment details, and admin workflows.

# Requirements
- Every answer must show where it came from, or explain why no grounded answer was available.
- The chat flow must respect permission-aware retrieval before context reaches the model.
- The surface must support swapping OpenAI and Gemini behind one contract.
- The UI must remain source-first and should not hide provenance behind a generic chatbot shell.

# Acceptance criteria
- Users can ask questions locally and get grounded answers with citations.
- The local flow can switch providers without changing the visible experience.
- Permission-denied and no-answer cases are understandable.
- The chat surface is usable enough to compare answer quality during local validation.

# Validation / test plan
- Run representative local questions against the pilot content and verify citations.
- Check that denied content never appears in the answer context.
- Compare a small evaluation set across providers and record the outcome.
- Run `python3 logics/skills/logics-doc-linter/scripts/logics_lint.py --require-status`.

# Open questions
- Which answer quality signals should be treated as must-pass for V1?

# References
- `logics/product/prod_000_sharepoint_knowledge_graph_product_vision.md`
- `logics/product/prod_001_local_first_development_and_test_strategy.md`
- `logics/backlog/item_007_v1_llm_provider_abstraction_for_openai_and_gemini.md`
- `logics/backlog/item_009_v1_local_chat_surface_and_answer_flow.md`
- `logics/architecture/adr_008_llm_provider_abstraction_for_openai_and_gemini.md`
- `logics/architecture/adr_009_permission_aware_retrieval_and_source_filtering.md`
- `logics/architecture/adr_011_observability_audit_and_answer_traceability.md`
- `logics/architecture/adr_012_local_companion_runtime_for_explorer_and_chat.md`
