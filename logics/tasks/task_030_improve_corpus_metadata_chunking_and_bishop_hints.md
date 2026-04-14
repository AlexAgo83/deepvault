## task_030_improve_corpus_metadata_chunking_and_bishop_hints - Improve corpus metadata chunking and Bishop hints
> From version: 1.1.0
> Schema version: 1.0
> Status: Done
> Understanding: 100%
> Confidence: 100%
> Progress: 100%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/backlog references when you edit this doc.
> Maintenance edit: synced completion checklist and DoD with the already-delivered corpus quality wave.

# Context
- Derived from backlog item `item_062_improve_corpus_metadata_chunking_and_bishop_hints`.
- Source file: `logics/backlog/item_062_improve_corpus_metadata_chunking_and_bishop_hints.md`.
- Related request(s): `req_017_implement_the_full_app_worker_corpus_and_shell_plan`.
- Enrich ingestion so the corpus carries enough structure and context to improve retrieval quality.
- Make Bishop hints less generic by using stronger metadata and chunk traceability.
- Preserve the permission-aware, local-first pipeline while improving corpus signals.

```mermaid
%% logics-kind: task
%% logics-signature: task|improve-corpus-metadata-chunking-and-bis|item-062-improve-corpus-metadata-chunkin|1-confirm-scope-dependencies-and-linked|run-the-relevant-automated-tests-for
stateDiagram-v2
    state "item_062_improve_corpus_metadata_chunking_" as Backlog
    state "1. Confirm scope dependencies and linked" as Scope
    state "2. Implement the next coherent delivery" as Build
    state "3. Checkpoint the wave in a" as Verify
    state "Run the relevant automated tests for" as Validation
    state "Done report" as Report
    [*] --> Backlog
    Backlog --> Scope
    Scope --> Build
    Build --> Verify
    Verify --> Validation
    Validation --> Report
    Report --> [*]
```

# Plan
- [x] 1. Confirm scope, dependencies, and linked acceptance criteria.
- [x] 2. Implement the next coherent delivery wave from the backlog item.
- [x] 3. Checkpoint the wave in a commit-ready state, validate it, and update the linked Logics docs.
- [x] CHECKPOINT: leave the current wave commit-ready and update the linked Logics docs before continuing.
- [x] CHECKPOINT: if the shared AI runtime is active and healthy, run `python logics/skills/logics.py flow assist commit-all` for the current step, item, or wave commit checkpoint.
- [x] GATE: do not close a wave or step until the relevant automated tests and quality checks have been run successfully.
- [x] FINAL: Update related Logics docs

# Delivery checkpoints
- Each completed wave should leave the repository in a coherent, commit-ready state.
- Update the linked Logics docs during the wave that changes the behavior, not only at final closure.
- Prefer a reviewed commit checkpoint at the end of each meaningful wave instead of accumulating several undocumented partial states.
- If the shared AI runtime is active and healthy, use `python logics/skills/logics.py flow assist commit-all` to prepare the commit checkpoint for each meaningful step, item, or wave.
- Do not mark a wave or step complete until the relevant automated tests and quality checks have been run successfully.

# AC Traceability
- AC1 -> Scope: Ingestion persists richer metadata including source and structural context where available.. Proof: capture validation evidence in this doc.
- AC2 -> Scope: Chunking preserves section or heading context so chunks remain traceable to the source passage.. Proof: capture validation evidence in this doc.
- AC3 -> Scope: Retrieval relevance improves for short or vague questions when the corpus contains matching material.. Proof: capture validation evidence in this doc.
- AC4 -> Scope: Bishop hints use the richer corpus signal and are less likely to fall back to generic advice.. Proof: capture validation evidence in this doc.
- AC5 -> Scope: The new behavior is covered by tests for corpus loading, retrieval quality, and Bishop hint generation.. Proof: capture validation evidence in this doc.

# Decision framing
- Product framing: Consider
- Product signals: pricing and packaging
- Product follow-up: Review whether a product brief is needed before scope becomes harder to change.
- Architecture framing: Required
- Architecture signals: data model and persistence, state and sync, security and identity
- Architecture follow-up: Create or link an architecture decision before irreversible implementation work starts.

# Links
- Product brief(s): `prod_006_improve_ingestion_metadata_and_chunking_for_bishop_hints`
- Architecture decision(s): `adr_003_hybrid_knowledge_store_and_retrieval_model`, `adr_016_deepvault_persistence_and_storage_layout`, `adr_026_improve_ingestion_metadata_and_chunking_for_bishop_hints`
- Derived from `item_062_improve_corpus_metadata_chunking_and_bishop_hints`
- Request(s): `req_017_implement_the_full_app_worker_corpus_and_shell_plan`

# AI Context
- Summary: Improve corpus metadata chunking and Bishop hints.
- Keywords: corpus, metadata, chunking, bishop, hints, retrieval, ranking
- Use when: Use when implementing or reviewing the corpus quality stream.
- Skip when: Skip when the change is unrelated to retrieval quality or hint generation.
# References
- `logics/skills/logics-ui-steering/SKILL.md`

# Validation
- Run the relevant automated tests for the changed surface before closing the current wave or step.
- Run the relevant lint or quality checks before closing the current wave or step.
- Confirm the completed wave leaves the repository in a commit-ready state.

# Definition of Done (DoD)
- [x] Scope implemented and acceptance criteria covered.
- [x] Validation commands executed and results captured.
- [x] No wave or step was closed before the relevant automated tests and quality checks passed.
- [x] Linked request/backlog/task docs updated during completed waves and at closure.
- [x] Each completed wave left a commit-ready checkpoint or an explicit exception is documented.
- [x] Status is `Done` and progress is `100%`.

# Report
- Delivered section-aware chunking: `CorpusDocument` now carries `sections?: CorpusSection[]` (heading + content) and `fileType?: string`. `Corpus` root carries `schemaVersion: "1.1"`.
- Scoring upgraded in `src/lib/scoring.ts`: section heading match +7, section content +4, flat content fallback +4, author +3, fileType +2.
- `groundQuestion` populates `sectionHint` and `fileType` on each `SourceRecord` via updated `buildSource(document, score, corpusData, query?)`.
- Bishop prompts enriched via `buildSourceLine` — source lines include `by ${author}` and `§ ${sectionHint}` when available.
- `buildImprovementHint` now uses `topSource.author`, `topSource.tags`, and `topSource.fileType` for specific advice instead of generic fallback text.
- `data/pilot-corpus.json` upgraded to schema 1.1 with `schemaVersion`, `fileType`, and 2-3 `sections` per document across all 17 entries.
- 13 new tests added: 5 in `scoring.spec.ts`, 5 in `deepvault.spec.ts`, 3 in `bishop.spec.ts`. All 188 tests pass.
- AC1 ✓ — richer metadata (fileType, sections, author) in corpus. AC2 ✓ — section headings preserved per chunk. AC3 ✓ — section heading match (+7) improves short/vague query ranking. AC4 ✓ — Bishop hints use author, tags, fileType. AC5 ✓ — 13 new tests covering all surfaces.
