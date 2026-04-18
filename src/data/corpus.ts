export { fetchLiveCorpus, getMockCorpusBundle, isCorpusLike, type CorpusBundle, type LiveCorpusFetchResult } from '../lib/corpus-client'
export { default } from '../lib/mock-corpus'
import { normalizeCorpusMode, type CorpusMode } from '../lib/corpus-mode'

export function normalizeRequestedCorpusMode(value: string | undefined | null): CorpusMode {
  return normalizeCorpusMode(value)
}
