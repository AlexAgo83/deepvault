# Contributing to DeepVault Nexus

Thanks for helping improve DeepVault Nexus.

This repo is local-first and intentionally opinionated:

- React + TypeScript for the UI
- small, bounded waves of work
- no code file should exceed 1000 lines
- commit after each meaningful step
- keep mock/live data boundaries explicit

## Before You Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. If you are testing live data, create `.env.local` from `.env.exemple` and fill in your own values.

3. Run the local app or validation commands before you start changing behavior:

   ```bash
   npm run dev
   npm run lint
   npm run test
   ```

## Code Style

- Prefer TypeScript for new code.
- Prefer React components and hooks over ad hoc DOM logic.
- Keep modules small and bounded.
- If a file starts growing toward 1000 lines, split it before adding more.
- Match the existing local-first patterns instead of introducing a new stack.

## What To Include In A Change

- implementation
- validation
- documentation updates when behavior changes
- if relevant, live/local test instructions

## Validation Expectations

Run the most relevant checks for the change:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

For live data work:

```bash
npm run export:live
npm run ingest:live -- --input public/live-corpus.json
npm run evaluate:live -- --input public/live-corpus.json
```

For browser flow checks:

```bash
npm run e2e
```

## Pull Requests

- Keep PRs small when possible.
- Describe what changed, why it changed, and how it was validated.
- Mention any live-data assumptions or required environment variables.
- If you add a new artifact or generated file, state whether it should be tracked or ignored.

## Commit Style

Use short, clear commit messages that describe one wave of work.

Good examples:

- `Add live export progress logs`
- `Ignore Playwright and DS_Store artifacts`
- `Refine live corpus loading`

## Questions

If something is unclear, open a small issue or leave a note in the PR before making a large assumption.
