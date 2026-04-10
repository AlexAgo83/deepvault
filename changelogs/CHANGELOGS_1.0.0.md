# CHANGELOGS_1.0.0

Release date: 2026-04-10

## DeepVault Nexus 1.0.0

DeepVault Nexus 1.0.0 is the first release of the local V1 workspace and the live SharePoint export pipeline.

It turns the project into a practical local lab for DeepVault: a React + TypeScript UI, a permission-aware retrieval layer, and a live export path for configured SharePoint sites.

### At a glance

- Local UI for `DeepVault - Navy`, `DeepVault - Bishop`, and sync visibility
- Permission-aware retrieval on top of the bundled pilot corpus
- Mock and live corpus switching for browser and CLI testing
- SharePoint / Microsoft Graph export powered by `.env.local`
- Pagination progress logs and memory guards for large live runs
- Local ingestion and evaluation commands for mock and live corpus files
- Project branding, MIT license, and contribution guidance

### Why it matters

- You can exercise the full loop locally without depending on the hosted backend.
- You can export real SharePoint content into a local corpus when you need live data.
- The live pipeline stays readable and debuggable even on large sites.

### Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run evaluate
npm run e2e
npm run export:live
npm run ingest:live -- --input public/live-corpus.json
npm run evaluate:live -- --input public/live-corpus.json
```

### Notes

- `public/live-corpus.json`, `data/runtime/`, and `data/eval/*.live.json` are generated locally and ignored by Git.
- Large PDFs / presentations may be retained as metadata only to keep exports stable.
- Live corpus files can contain business content and should stay local unless you intentionally export them elsewhere.
