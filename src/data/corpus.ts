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
  | { status: 'offline'; detail: string }
  | { status: 'error'; detail: string }

const LAST_LIVE_CORPUS_FETCH_AT_STORAGE_KEY = 'deepvault:last-live-corpus-fetch-at'

let cachedLiveCorpus: { etag: string; corpus: Corpus } | null = null

export function getMockCorpusBundle(): CorpusBundle {
  return { corpus: mockCorpus as Corpus, mode: 'mock' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function isSectionArray(value: unknown): boolean {
  return Array.isArray(value)
    && value.every(
      (section) =>
        isRecord(section) &&
        typeof section.heading === 'string' &&
        typeof section.content === 'string',
    )
}

function isAnalysisLike(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }

  return (
    (value.status === 'not_analyzed' ||
      value.status === 'analyzed' ||
      value.status === 'excluded' ||
      value.status === 'failed' ||
      value.status === 'stale') &&
    typeof value.version === 'string' &&
    (typeof value.provider === 'string' || typeof value.provider === 'undefined') &&
    (typeof value.model === 'string' || typeof value.model === 'undefined') &&
    (typeof value.analyzedAt === 'string' || typeof value.analyzedAt === 'undefined') &&
    (typeof value.contentHash === 'string' || typeof value.contentHash === 'undefined') &&
    (typeof value.summary === 'string' || typeof value.summary === 'undefined') &&
    (typeof value.documentType === 'string' || typeof value.documentType === 'undefined') &&
    (typeof value.confidence === 'number' || typeof value.confidence === 'undefined') &&
    (typeof value.excludedReason === 'string' || typeof value.excludedReason === 'undefined') &&
    (typeof value.failureReason === 'string' || typeof value.failureReason === 'undefined') &&
    (typeof value.keywords === 'undefined' || isStringArray(value.keywords)) &&
    (typeof value.sections === 'undefined' || isSectionArray(value.sections))
  )
}

export function isCorpusLike(value: unknown): value is Corpus {
  if (!isRecord(value)) {
    return false
  }

  const { schemaVersion, defaultUserRole, providers, sites, syncRuns, documents } = value
  if (typeof schemaVersion !== 'string' || schemaVersion.trim().length === 0) {
    return false
  }
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
        (typeof document.createdBy === 'string' || typeof document.createdBy === 'undefined') &&
        (typeof document.lastModifiedBy === 'string' || typeof document.lastModifiedBy === 'undefined') &&
        typeof document.updatedAt === 'string' &&
        typeof document.summary === 'string' &&
        typeof document.directAnswer === 'string' &&
        typeof document.content === 'string' &&
        isStringArray(document.tags) &&
        isStringArray(document.access) &&
        typeof document.source === 'string' &&
        (typeof document.webUrl === 'string' || typeof document.webUrl === 'undefined') &&
        (typeof document.sections === 'undefined' || isSectionArray(document.sections)) &&
        (typeof document.analysis === 'undefined' || isAnalysisLike(document.analysis)),
    )
}

export async function fetchLiveCorpus(): Promise<LiveCorpusFetchResult> {
  const headers: Record<string, string> = {}
  if (cachedLiveCorpus?.etag) {
    headers['If-None-Match'] = cachedLiveCorpus.etag
  }

  try {
    const response = await fetch('/api/corpus', { cache: 'no-store', headers })
    if (response.status === 304 && cachedLiveCorpus) {
      writeLastSuccessfulFetchAt(new Date().toISOString())
      return { status: 'loaded', corpus: cachedLiveCorpus.corpus, detail: 'Live corpus unchanged' }
    }
    if (!response.ok) {
      if (response.status === 404 || response.status === 410) {
        return { status: 'missing', detail: 'Worker corpus missing, fallback to mock' }
      }
      return { status: 'error', detail: `Worker corpus error: request failed with status ${response.status}` }
    }
    try {
      const payload: unknown = await response.json()
      if (!isCorpusLike(payload)) {
        return { status: 'error', detail: 'Worker corpus error: response payload was not a valid corpus' }
      }
      const etag = response.headers.get('etag')
      if (etag) {
        cachedLiveCorpus = { etag, corpus: payload }
      }
      writeLastSuccessfulFetchAt(new Date().toISOString())
      return { status: 'loaded', corpus: payload, detail: 'Worker corpus loaded' }
    } catch {
      return { status: 'error', detail: 'Worker corpus error: response body could not be parsed' }
    }
  } catch {
    const lastSuccessfulFetchAt = readLastSuccessfulFetchAt()
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        status: 'offline',
        detail: lastSuccessfulFetchAt
          ? `Worker corpus unavailable offline. Last successful fetch: ${lastSuccessfulFetchAt}`
          : 'Worker corpus unavailable offline and no successful fetch is cached yet',
      }
    }
    return {
      status: 'error',
      detail: lastSuccessfulFetchAt
        ? `Worker corpus request failed before a response was returned. Last successful fetch: ${lastSuccessfulFetchAt}`
        : 'Worker corpus request failed before a response was returned',
    }
  }
}

export function normalizeRequestedCorpusMode(value: string | undefined | null): CorpusMode {
  return normalizeCorpusMode(value)
}

function readLastSuccessfulFetchAt(): string | null {
  try {
    return window.localStorage.getItem(LAST_LIVE_CORPUS_FETCH_AT_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeLastSuccessfulFetchAt(value: string): void {
  try {
    window.localStorage.setItem(LAST_LIVE_CORPUS_FETCH_AT_STORAGE_KEY, value)
  } catch {
    // ignore storage failures
  }
}

export default mockCorpus as Corpus
