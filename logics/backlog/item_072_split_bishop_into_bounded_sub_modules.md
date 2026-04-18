## item_072_split_bishop_into_bounded_sub_modules - Split bishop.ts into bounded sub-modules

> From version: 1.3.0
> Schema version: 1.0
> Status: Obsolete
> Understanding: 97%
> Confidence: 96%
> Progress: 0%
> Complexity: Medium
> Theme: Maintainability
> Cancelled by: `logics/architecture/adr_035_python_fastapi_as_the_worker_runtime.md` — `bishop.ts` is removed from the browser bundle entirely. All bishop orchestration and LLM adapters move to the Python FastAPI worker (`worker/bishop.py`). Splitting the TypeScript module is no longer needed.
> Reminder: This item is cancelled. Do not implement.

# Problem

- `src/lib/bishop.ts` at 1216 lines formally violates the CONTRIBUTING.md rule of less than 1000 lines per file.
- Provider adapters, prompt construction, orchestration, and fallback logic are all collapsed into a single module — making execution path tracing and isolated testing difficult.

# Scope

- In: split `bishop.ts` into at minimum `bishop-adapters.ts` (provider adapters for OpenAI, Gemini, Anthropic), `bishop-prompts.ts` (prompt building), and `bishop-orchestration.ts` (main flow and fallback logic); no resulting file exceeds 1000 lines.
- Out: changes to the orchestration contract or Bishop response shape; new provider integrations.

# Acceptance criteria

- AC1: `src/lib/bishop.ts` is split into bounded sub-modules; no resulting file exceeds 1000 lines.
- AC2: Existing unit tests pass without modification after the split.
- AC3: Public exports from `src/lib/index.ts` remain unchanged so no import in the rest of the codebase needs updating.

# Links

- Request: `logics/request/req_018_post_v1_3_code_quality_security_and_maintainability_audit.md`
- Product brief(s): (none)
- Architecture decision(s): `logics/architecture/adr_033_split_bishop_ts_into_bounded_sub_modules.md`
- Task(s): `task_040_orchestrate_post_v1_3_code_quality_security_and_maintainability_audit`

# Validation evidence

- `rtk npm run test -- tests/bishop.spec.ts`
- `rtk npm run typecheck`
- `rtk npm run check`
