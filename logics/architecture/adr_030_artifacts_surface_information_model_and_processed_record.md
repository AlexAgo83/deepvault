## adr_030_artifacts_surface_information_model_and_processed_record - Artifacts surface information model and processed record
> Date: 2026-04-17
> Status: Accepted
> Drivers: Give operators a single read-only surface for generated outputs and per-file inspection.
> Related request: (none yet)
> Related backlog: `logics/backlog/item_070_ship_artifacts_inspection_surface.md`
> Related task: `logics/tasks/task_038_orchestrate_artifacts_visualization_surface_for_generated_outputs.md`
> Reminder: Update status, linked refs, decision rationale, consequences, migration plan, and follow-up work when you edit this doc.

# Decision
- Introduce a dedicated top-level `Artifacts` tab with global list-plus-detail inspection.
- Model first-wave artifacts as processed files, analysis artifacts, sync runs, and generated answer artifacts.
- Treat the processed file record as a first-class detail shape with identity, status, derived outputs, provenance, and diagnostics.

# Consequences
- Operators can debug ingestion and analysis outcomes without filesystem hunting.
- The first-wave surface stays inspection-first and leaves execution controls in `Knowledge`.
