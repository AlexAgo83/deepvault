# DeepVault Nexus

DeepVault Nexus is the local V1 workspace for the DeepVault product family.
It ships a grounded local surface for:

- `DeepVault - Navy` for exploration and source inspection
- `DeepVault - Bishop` for permission-aware chat and citations
- `DeepVault - Gordon` as the future Teams channel surface
- sync visibility for ingestion, refresh state, and provenance

The app runs on a bundled pilot corpus by default so V1 can be validated without a hosted backend.
You can also switch to a live corpus file for local testing when you have one.

## What is included

- A React + Vite local app
- A local retrieval engine with permission filtering
- A deterministic evaluation script for the V1 baseline
- A sync snapshot generator for local ingestion validation
- A mock/live corpus switch for local testing and future tenant-backed data
- A live export command that reads SharePoint through Microsoft Graph and writes a browser-ready JSON corpus

## Prerequisites

- Node 22
- npm

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the local app:

   ```bash
   npm run dev
   ```

3. Open the app at the Vite URL shown in the terminal.

## Local workflow

### Explorer

Use the explorer to browse pilot sites, inspect documents, and confirm source metadata.

### Bishop

Use Bishop to ask grounded questions against the same local corpus.
The answer trace shows the provider, chunk count, token estimate, and cited sources.

### Sync

Use the sync view to inspect the latest refresh state and ingestion metrics.

## Environment variables

The repository keeps the current local Microsoft and AI secrets in `.env.local`.
That file is ignored by Git and should remain local.

The provided environment block is intended for future Graph, Entra, and LLM wiring.
The current V1 app does not require those variables to run because it uses the bundled pilot corpus.

To switch the app to live data mode, set:

```bash
VITE_DEEPVAULT_DATA_MODE=live
```

If `public/live-corpus.json` exists locally, the app will use it. Otherwise it falls back to the bundled mock corpus.

## Ingestion

Run the local ingestion snapshot generator:

```bash
npm run ingest
```

This writes `data/runtime/sync-state.json`.

Run the live variant against a real exported corpus file:

```bash
npm run ingest:live -- --input /absolute/path/to/live-corpus.json
```

The live snapshot is written to `data/runtime/sync-state.live.json`.

## Evaluation

Run the V1 retrieval baseline:

```bash
npm run evaluate
```

This writes `data/eval/v1_baseline_YYYY-MM-DD.json`.

Run the live variant with a real corpus file:

```bash
npm run evaluate:live -- --input /absolute/path/to/live-corpus.json
```

The live baseline is written to `data/eval/v1_baseline_YYYY-MM-DD.live.json`.

## Exporting live data

Generate the browser-ready live corpus from the configured SharePoint sites:

```bash
npm run export:live
```

This reads the Graph / Entra settings from `.env.local`, crawls the configured `DEEPVAULT_ENTRA_SITES`, and writes `public/live-corpus.json`.

If you want to validate the pipeline without hitting Graph, you can run:

```bash
npm run export:live -- --mode mock
```

## Validation

Recommended validation sequence:

```bash
npm run lint
npm run test
npm run build
npm run evaluate
```

## Notes

- The local provider abstraction currently routes to deterministic retrieval logic for both OpenAI and Gemini labels.
- The corpus includes a restricted site so permission-aware retrieval can be exercised locally.
- Mock mode is the default. Live mode is an explicit opt-in for local testing against a real corpus export.
