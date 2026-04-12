import mockCorpus from '../../data/pilot-corpus.json'
import type { Corpus } from '../lib/deepvault'
import { normalizeCorpusMode, type CorpusMode } from '../lib/corpus-mode'

export interface CorpusBundle {
  corpus: Corpus
  mode: CorpusMode
}

export type LiveCorpusFetchResult =
  | { status: 'loaded'; corpus: Corpus; detail: string }
  | { status: 'missing'; detail: string }
  | { status: 'error'; detail: string }

export function getMockCorpusBundle(): CorpusBundle {
  return { corpus: mockCorpus as Corpus, mode: 'mock' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function isCorpusLike(value: unknown): value is Corpus {
  if (!isRecord(value)) {
    return false
  }

  const { defaultUserRole, providers, sites, syncRuns, documents } = value
  if (defaultUserRole !== 'analyst' && defaultUserRole !== 'admin' && defaultUserRole !== 'guest') {
    return false
  }
  if (!Array.isArray(providers) || !Array.isArray(sites) || !Array.isArray(syncRuns) || !Array.isArray(documents)) {
    return false
  }

  return providers.every((provider) => isRecord(provider) && typeof provider.id === 'string' && typeof provider.name === 'string' && typeof provider.ready === 'boolean')
    && sites.every(
      (site) =>
        isRecord(site) &&
        typeof site.id === 'string' &&
        typeof site.name === 'string' &&
        typeof site.url === 'string' &&
        typeof site.libraryCount === 'number' &&
        typeof site.listCount === 'number' &&
        (site.status === 'synced' || site.status === 'restricted' || site.status === 'pending' || site.status === 'sync_failed') &&
        isStringArray(site.access) &&
        typeof site.owner === 'string',
    )
    && syncRuns.every(
      (run) =>
        isRecord(run) &&
        typeof run.id === 'string' &&
        typeof run.startedAt === 'string' &&
        typeof run.finishedAt === 'string' &&
        typeof run.scope === 'string' &&
        (run.status === 'synced' || run.status === 'restricted' || run.status === 'pending' || run.status === 'sync_failed') &&
        Array.isArray(run.siteIds) &&
        run.siteIds.every((entry) => typeof entry === 'string') &&
        typeof run.documentsSynced === 'number' &&
        typeof run.chunksWritten === 'number' &&
        typeof run.notes === 'string',
    )
    && documents.every(
      (document) =>
        isRecord(document) &&
        typeof document.id === 'string' &&
        typeof document.siteId === 'string' &&
        typeof document.kind === 'string' &&
        typeof document.title === 'string' &&
        typeof document.path === 'string' &&
        typeof document.author === 'string' &&
        typeof document.updatedAt === 'string' &&
        typeof document.summary === 'string' &&
        typeof document.directAnswer === 'string' &&
        typeof document.content === 'string' &&
        isStringArray(document.tags) &&
        isStringArray(document.access) &&
        typeof document.source === 'string' &&
        (typeof document.webUrl === 'string' || typeof document.webUrl === 'undefined'),
    )
}

export async function fetchLiveCorpus(): Promise<LiveCorpusFetchResult> {
  try {
    const response = await fetch('/live-corpus.json', { cache: 'no-store' })
    if (!response.ok) {
      if (response.status === 404 || response.status === 410) {
        return { status: 'missing', detail: 'Live corpus missing, fallback to mock' }
      }
      return { status: 'error', detail: `Live corpus error: request failed with status ${response.status}` }
    }
    try {
      const payload: unknown = await response.json()
      if (!isCorpusLike(payload)) {
        return { status: 'error', detail: 'Live corpus error: response payload was not a valid corpus' }
      }
      return { status: 'loaded', corpus: payload, detail: 'Live corpus loaded' }
    } catch {
      return { status: 'error', detail: 'Live corpus error: response body could not be parsed' }
    }
  } catch {
    return { status: 'error', detail: 'Live corpus error: request failed before a response was returned' }
  }
}

export function normalizeRequestedCorpusMode(value: string | undefined | null): CorpusMode {
  return normalizeCorpusMode(value)
}

export default mockCorpus as Corpus
