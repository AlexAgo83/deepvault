import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isCorpusLike } from '../src/lib/corpus-client'
import { type CorpusLike, type DeepVaultExportConfig } from './deepvault-graph'

export const liveCheckpointPath = resolve('data/runtime/live-export-checkpoint.json')

export interface LiveExportCheckpoint extends CorpusLike {
  syncedAt?: string
}

export function readCliArg(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

export function readCliFlag(argv: string[], name: string): boolean {
  return argv.includes(name)
}

export function normalizeMode(value: string | undefined): 'live' | 'mock' {
  return value === 'mock' ? 'mock' : 'live'
}

export function buildProviderState(): CorpusLike['providers'] {
  return [
    { id: 'openai', name: 'OpenAI', ready: Boolean(process.env.OPENAI_API_KEY) },
    { id: 'gemini', name: 'Gemini', ready: Boolean(process.env.GEMINI_API_KEY) },
    { id: 'anthropic', name: 'Claude', ready: Boolean(process.env.ANTHROPIC_API_KEY) },
  ]
}

export function resolveCheckpointSyncedAt(checkpoint: LiveExportCheckpoint | null | undefined): string | null {
  return checkpoint?.syncedAt || checkpoint?.syncRuns?.[0]?.finishedAt || null
}

export function resolveLiveExportResumeState(
  resumeRequested: boolean,
  checkpoint: LiveExportCheckpoint | null | undefined,
): { seedFromCheckpoint: boolean; updatedAfter: string | null } {
  if (!resumeRequested) {
    return { seedFromCheckpoint: false, updatedAfter: null }
  }

  const updatedAfter = resolveCheckpointSyncedAt(checkpoint)
  if (!checkpoint || !updatedAfter) {
    return { seedFromCheckpoint: false, updatedAfter: null }
  }

  return {
    seedFromCheckpoint: true,
    updatedAfter,
  }
}

export async function readCorpusLikeFile(path: string): Promise<LiveExportCheckpoint | null> {
  try {
    const payload: unknown = JSON.parse(await readFile(path, 'utf8'))
    return isCorpusLike(payload) ? payload : null
  } catch {
    return null
  }
}

export function buildLiveExportCorpus(
  config: DeepVaultExportConfig,
  data: {
    startedAt: string
    syncedAt?: string
    sites: CorpusLike['sites']
    documents: CorpusLike['documents']
    siteIds: string[]
    totalLibraries: number
    totalLists: number
    notes: string
    status: CorpusLike['syncRuns'][number]['status']
  },
): LiveExportCheckpoint {
  const syncedAt = data.syncedAt || new Date().toISOString()
  return {
    schemaVersion: '1.1',
    defaultUserRole: 'analyst',
    providers: buildProviderState(),
    sites: data.sites,
    syncedAt,
    syncRuns: [
      {
        id: `sync-${new Date().toISOString().slice(0, 10)}-live`,
        startedAt: data.startedAt,
        finishedAt: syncedAt,
        scope: `SharePoint live export from ${config.siteUrls.length} configured site(s)`,
        status: data.status,
        siteIds: data.siteIds,
        documentsSynced: data.documents.length,
        chunksWritten: data.documents.length * 6,
        notes: data.notes,
      },
    ],
    documents: data.documents,
  }
}
