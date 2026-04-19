# Changelog (`start -> 1.0.0`)

Release date: 2026-04-10

## Major Highlights

- DeepVault Nexus 1.0.0 is the first release of the local V1 workspace and the live SharePoint export pipeline.
- The release turns the project into a practical local lab for DeepVault with a React + TypeScript UI, a permission-aware retrieval layer, and live export for configured SharePoint sites.
- Local and live corpus switching is in place for browser and CLI testing.
- The packaging baseline ships with project branding, MIT licensing, and contribution guidance.

### Core App

- Local UI for `DeepVault - Navy`, `DeepVault - Bishop`, and sync visibility.
- Permission-aware retrieval on top of the bundled pilot corpus.
- Local ingestion and evaluation commands for mock and live corpus files.

### Live Export and Ingestion

- Mock and live corpus switching for browser and CLI testing.
- SharePoint and Microsoft Graph export powered by `.env.local`.
- Pagination progress logs and memory guards for large live runs.

### Packaging

- Project branding, MIT license, and contribution guidance.
- Release notes and package metadata for the initial public baseline.

### Validation and Regression Evidence

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run evaluate`
- `npm run e2e`
- `npm run export:live`
- `npm run ingest:live -- --input public/live-corpus.json`
- `npm run evaluate:live -- --input public/live-corpus.json`

## Notes

- `public/live-corpus.json`, `data/runtime/`, and `data/eval/*.live.json` are generated locally and ignored by Git.
- Large PDFs and presentations may be retained as metadata only to keep exports stable.
- Live corpus files can contain business content and should stay local unless you intentionally export them elsewhere.
