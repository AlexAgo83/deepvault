import { describe, expect, it } from 'vitest'
import { DEFAULT_CORPUS_MODE, describeCorpusMode, normalizeCorpusMode, resolveCorpusMode } from '../src/lib/corpus-mode'

describe('corpus mode helpers', () => {
  it('defaults unknown values to mock mode', () => {
    expect(DEFAULT_CORPUS_MODE).toBe('mock')
    expect(normalizeCorpusMode(undefined)).toBe('mock')
    expect(normalizeCorpusMode(null)).toBe('mock')
    expect(normalizeCorpusMode('anything else')).toBe('mock')
  })

  it('keeps live mode explicit and describes both modes', () => {
    expect(normalizeCorpusMode('live')).toBe('live')
    expect(describeCorpusMode('live')).toBe('live data')
    expect(describeCorpusMode('mock')).toBe('mock data')
  })

  it('lets the settings override the env default when resolving corpus mode', () => {
    expect(resolveCorpusMode('mock', 'live')).toBe('live')
    expect(resolveCorpusMode('live', 'mock')).toBe('mock')
    expect(resolveCorpusMode('live', '')).toBe('live')
    expect(resolveCorpusMode(undefined, undefined)).toBe('mock')
  })
})
