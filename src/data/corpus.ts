import mockCorpus from '../../data/pilot-corpus.json'
import type { Corpus } from '../lib/deepvault'
import { normalizeCorpusMode, type CorpusMode } from '../lib/corpus-mode'

const liveCorpusModules = import.meta.glob('../../data/live-corpus.json', {
  eager: true,
  import: 'default',
}) as Record<string, Corpus>

export interface CorpusBundle {
  corpus: Corpus
  mode: CorpusMode
}

export function loadCorpus(mode: CorpusMode = normalizeCorpusMode(import.meta.env.VITE_DEEPVAULT_DATA_MODE)): CorpusBundle {
  if (mode === 'live') {
    const liveCorpus = Object.values(liveCorpusModules)[0]
    if (liveCorpus) {
      return { corpus: liveCorpus, mode: 'live' }
    }
  }

  return { corpus: mockCorpus as Corpus, mode: 'mock' }
}

export default loadCorpus().corpus
