## item_070_ship_artifacts_inspection_surface - Ship Artifacts inspection surface
> From version: 1.3.0
> Schema version: 1.0
> Status: Done
> Understanding: 96%
> Confidence: 94%
> Progress: 100%
> Complexity: Medium
> Theme: Product / Architecture
> Reminder: Update status, understanding, confidence, progress and linked request/task references when you edit this doc.

# Problem
- Generated outputs were spread across runtime files, run history, and ad hoc debugging.
- Operators lacked a single inspection-first surface to answer what the system produced for a file or run.

# Scope
- In: a top-level `Artifacts` tab, global filtering/grouping, processed-file detail inspection, and diagnostics blocks.
- Out: editing artifacts, re-running jobs from the surface, or turning the view into a file manager.

# Acceptance criteria
- AC1: Users can browse generated outputs globally from a dedicated `Artifacts` surface.
- AC2: A processed SharePoint file record shows identity, status, derived outputs, and diagnostics.
- AC3: Analysis artifacts and generated answer artifacts appear as first-class categories.

# Links
- Product brief(s): `logics/product/prod_011_add_an_artifacts_visualization_surface_for_generated_outputs.md`
- Architecture decision(s): `logics/architecture/adr_030_artifacts_surface_information_model_and_processed_record.md`
- Task(s): `logics/tasks/task_038_orchestrate_artifacts_visualization_surface_for_generated_outputs.md`

# Validation evidence
- `rtk npm run test -- tests/artifacts-panel.spec.tsx tests/app.spec.tsx`
- `rtk npm run check`
