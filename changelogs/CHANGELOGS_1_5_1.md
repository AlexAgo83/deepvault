# Changelog (`1.5.0 -> 1.5.1`)

Release date: 2026-04-19

## Major Highlights

- DeepVault Nexus 1.5.1 is a polish and correctness patch over 1.5.0, addressing icon quality, UI consistency, a regression in Bishop artifact generation, and e2e reliability.
- Topbar and sidebar icons were redesigned: (i) and (?) no longer carry an outer circle, the stats toggle is correctly sized for its circular button, and Knowledge, Artifacts, and Settings now use cleaner, more representative shapes.
- Bishop artifact generation was restored after the worker-proxy refactor inadvertently dropped the client-side generation path.
- Stats header KPI grids now default to hidden, reducing visual noise on first load.

### Icon Redesign

- Removed the outer `<circle>` from the Info (i) and Question (?) topbar buttons — the circular button container already provides the frame.
- Stats toggle icon resized to sit comfortably inside its circular button without touching the edges.
- Knowledge sidebar icon replaced with a database-cylinder shape that better represents the corpus knowledge store.
- Artifacts sidebar icon replaced with a document-with-fold shape that reflects generated output.
- Settings sidebar icon replaced with a horizontal-sliders shape, clearly distinct from the previous sun-like gear.

### Bishop Artifact Generation

- Re-introduced `resolveArtifactFields` as an exported helper in `bishop-orchestration.ts`.
- `bishop-client.ts` now applies local artifact resolution for both fallback and remote-worker results, restoring the ability to request downloadable `.txt`, `.md`, `.json`, and `.csv` files from Bishop regardless of worker mode.

### UI and UX Fixes

- Operations console in Knowledge: Progress and Duration merged into a single row — the duration now appears inline as `45% (2m 30s)`.
- Analyze confirm modal updated to explicitly state that API calls will be made and tokens consumed, with a note about provider rates.
- Knowledge panel tooltips (Refresh, Start Sync, Resume Sync) no longer get clipped by the panel's left edge — the tooltip anchors to the left of the button instead of centering.
- AI View two-column grid now uses `minmax(0, 22rem)` for the right panel, matching the column width of Settings and Artifacts.
- Stats header KPI grids default to hidden on all panels; previously they defaulted to visible.

### Test Reliability

- `dismissGettingStarted` e2e helper now waits for the getting-started dialog to become visible before attempting to dismiss it, fixing a race condition that caused the backdrop to block subsequent clicks in the offline workflow test.

## Validation and Regression Evidence

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run e2e`

## Notes

- Existing `localStorage` values for stats header visibility are preserved; users who had enabled headers will keep their preference.
- The Bishop artifact feature requires a corpus with at least one answered result and a query that includes a file-generation intent (e.g. "generate a markdown file", "create a CSV").
