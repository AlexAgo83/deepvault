import mockCorpus from '../../data/pilot-corpus.json'
import type { Corpus } from './runtime-types'

export function getMockCorpus(): Corpus {
  return mockCorpus as Corpus
}

export default mockCorpus as Corpus
