## spec_007_bishop_generated_artifact_response_and_download_contract - Bishop generated artifact response and download contract
> From version: 1.3.0
> Understanding: 95%
> Confidence: 93%
> Related backlog: `logics/backlog/item_068_deliver_bishop_first_wave_generated_artifact_contract.md`
> Related architecture: `logics/architecture/adr_028_bound_bishop_generated_artifact_response_and_download_contract.md`

# Overview
This spec defines the first shipped Bishop artifact contract. It covers when an artifact is requested, which formats are supported, how the response shape carries artifact state, how the UI exposes download affordances, and when the in-app path must stop and defer richer formats.

# Goals
- Define a bounded artifact result shape for Bishop turns.
- Keep normal answer behavior intact when no artifact is requested.
- Make ready, unsupported, and failed artifact states explicit in the UI contract.
- Keep the first shipped path local, auditable, and easy to validate.

# Non-goals
- Binary office file generation.
- Background file persistence.
- Arbitrary filesystem writes.
- Rich document layout logic.

# Intent detection

An artifact request is explicit when the user asks Bishop to create, generate, export, write, or prepare a file or document, and the request names or implies a supported format.

Supported first-wave formats:
- `.txt`
- `.md`
- `.json`
- `.csv`

Unsupported first-wave formats:
- `.pdf`
- `.docx`
- `.xlsx`
- `.pptx`

If a supported format is not named but the user still explicitly asks for a file, the default format is `.txt`.

# Response contract

```json
{
  "status": "answered",
  "provider": "openai",
  "query": "Create a JSON file of the Q3 2025 budget answer",
  "answer": "The Q3 2025 budget is 4.8M USD.",
  "sources": [],
  "deniedSources": [],
  "chunkCount": 6,
  "tokenCount": 120,
  "latencyMs": 50,
  "artifactStatus": "ready",
  "artifactNotice": "Artifact ready: q3-2025-budget.json",
  "artifact": {
    "kind": "document",
    "format": "json",
    "filename": "q3-2025-budget.json",
    "mimeType": "application/json",
    "content": "{ ... }"
  }
}
```

Rules:
- `artifact` is optional.
- `artifactStatus` must be one of:
  - `none`
  - `ready`
  - `unsupported_format`
  - `generation_failed`
- `artifactNotice` is optional but should be present whenever `artifactStatus !== "none"`.
- A ready artifact must include `kind`, `format`, `filename`, `mimeType`, and `content`.
- Invalid remote artifact payloads must be treated as `generation_failed`.

# Packaging rules

The first-wave app packages the final grounded answer into a downloadable artifact:
- `.txt`: plain answer text
- `.md`: answer text wrapped as a minimal Markdown document
- `.json`: structured payload containing query, answer, and source metadata
- `.csv`: line-oriented answer rows when available, otherwise a bounded export of source metadata

Filenames:
- use a sanitized requested filename when the user explicitly names one,
- otherwise derive a slug from the query and append the resolved extension.

# UI contract

When `artifactStatus = "ready"`:
- the Bishop message header shows `Download` before the `100%` and `?` pills,
- the Bishop right-side trace panel shows an `Artifact` row under `Confidence` with `Download`,
- the turn may also show an artifact notice for traceability.

When `artifactStatus = "unsupported_format"` or `artifactStatus = "generation_failed"`:
- no download button is shown for that surface,
- the turn must expose an explicit notice instead of a silent omission.

# Error handling

| Condition | Contract outcome |
|---|---|
| Explicit unsupported format request | `artifactStatus = "unsupported_format"` with a user-visible notice |
| Explicit supported format request but no grounded answer can be packaged | `artifactStatus = "generation_failed"` with a user-visible notice |
| Remote payload includes malformed artifact fields | `artifactStatus = "generation_failed"` with a user-visible notice |
| No artifact requested | `artifactStatus = "none"` and no artifact |

# Worker boundary

The in-app Bishop path stops at small text-like artifacts. Defer to a worker-backed follow-up when any of the following becomes necessary:
- binary or office-native formats,
- larger payload budgets,
- document templating,
- multi-file packaging,
- non-browser download assembly,
- persistent artifact storage.

# Validation / test plan
- Verify supported artifact packaging in `tests/bishop.spec.ts`.
- Verify message-header `Download` behavior in `tests/app-ui.spec.tsx`.
- Verify trace-panel artifact behavior in `tests/bishop-panel.spec.tsx`.
- Verify conversation wiring still persists and replays normal Bishop turns in `tests/use-bishop-conversation.spec.tsx`.
- Run `rtk npm run typecheck`.

# References
- `logics/product/prod_009_enable_bishop_generated_document_artifacts.md`
- `logics/architecture/adr_028_bound_bishop_generated_artifact_response_and_download_contract.md`
