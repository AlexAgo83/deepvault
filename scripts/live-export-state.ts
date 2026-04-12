import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { type CorpusLike, type DeepVaultExportConfig } from './deepvault-graph'

export const liveCheckpointPath = resolve('data/runtime/live-export-checkpoint.json')

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

export async function readCorpusLikeFile(path: string): Promise<CorpusLike | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as CorpusLike
  } catch {
    return null
  }
}

export function buildLiveExportCorpus(
  config: DeepVaultExportConfig,
  data: {
    startedAt: string
    sites: CorpusLike['sites']
    documents: CorpusLike['documents']
    siteIds: string[]
    totalLibraries: number
    totalLists: number
    notes: string
    status: CorpusLike['syncRuns'][number]['status']
  },
): CorpusLike {
  return {
    defaultUserRole: 'analyst',
    providers: buildProviderState(),
    sites: data.sites,
    syncRuns: [
      {
        id: `sync-${new Date().toISOString().slice(0, 10)}-live`,
        startedAt: data.startedAt,
        finishedAt: new Date().toISOString(),
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
