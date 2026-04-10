import mockCorpus from '../../data/pilot-corpus.json'
import type { Corpus } from '../lib/deepvault'
import { normalizeCorpusMode, type CorpusMode } from '../lib/corpus-mode'

export interface CorpusBundle {
  corpus: Corpus
  mode: CorpusMode
}

export function getMockCorpusBundle(): CorpusBundle {
  return { corpus: mockCorpus as Corpus, mode: 'mock' }
}

export async function fetchLiveCorpus(): Promise<Corpus | null> {
  try {
    const response = await fetch('/live-corpus.json', { cache: 'no-store' })
    if (!response.ok) {
      return null
    }
    return (await response.json()) as Corpus
  } catch {
    return null
  }
}

export function normalizeRequestedCorpusMode(value: string | undefined | null): CorpusMode {
  return normalizeCorpusMode(value)
}

export default mockCorpus as Corpus
