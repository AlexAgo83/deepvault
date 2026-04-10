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

export async function fetchLiveCorpus(): Promise<LiveCorpusFetchResult> {
  try {
    const response = await fetch('/live-corpus.json', { cache: 'no-store' })
    if (!response.ok) {
      if (response.status === 404 || response.status === 410) {
        return { status: 'missing', detail: 'Live corpus missing, fallback to mock' }
      }
      return { status: 'error', detail: `Live corpus error: request failed with status ${response.status}` }
    }
    return { status: 'loaded', corpus: (await response.json()) as Corpus, detail: 'Live corpus loaded' }
  } catch {
    return { status: 'error', detail: 'Live corpus error: request failed before a response was returned' }
  }
}

export function normalizeRequestedCorpusMode(value: string | undefined | null): CorpusMode {
  return normalizeCorpusMode(value)
}

export default mockCorpus as Corpus
