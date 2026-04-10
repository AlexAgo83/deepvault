import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchLiveCorpus, getMockCorpusBundle, normalizeRequestedCorpusMode } from '../src/data/corpus'

describe('corpus helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns the bundled mock corpus', () => {
    const bundle = getMockCorpusBundle()

    expect(bundle.mode).toBe('mock')
    expect(bundle.corpus.documents.length).toBeGreaterThan(0)
    expect(bundle.corpus.sites).toHaveLength(3)
  })

  it('normalizes requested corpus mode values', () => {
    expect(normalizeRequestedCorpusMode('live')).toBe('live')
    expect(normalizeRequestedCorpusMode('mock')).toBe('mock')
    expect(normalizeRequestedCorpusMode(undefined)).toBe('mock')
    expect(normalizeRequestedCorpusMode(null)).toBe('mock')
  })

  it('returns the live corpus when fetch succeeds', async () => {
    const { corpus } = getMockCorpusBundle()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => corpus,
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchLiveCorpus()).resolves.toEqual(corpus)
    expect(fetchMock).toHaveBeenCalledWith('/live-corpus.json', { cache: 'no-store' })
  })

  it('returns null when the live corpus request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error('should not be called')
      },
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchLiveCorpus()).resolves.toBeNull()
  })
})
