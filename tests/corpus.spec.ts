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

    await expect(fetchLiveCorpus()).resolves.toMatchObject({ status: 'loaded', corpus })
    expect(fetchMock).toHaveBeenCalledWith('/live-corpus.json', { cache: 'no-store' })
  })

  it('returns the fallback state when the live corpus is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => {
        throw new Error('should not be called')
      },
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchLiveCorpus()).resolves.toMatchObject({
      status: 'missing',
      detail: 'Live corpus missing, fallback to mock',
    })
  })

  it('returns the fallback state when the live corpus is gone', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 410,
      json: async () => {
        throw new Error('should not be called')
      },
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchLiveCorpus()).resolves.toMatchObject({
      status: 'missing',
      detail: 'Live corpus missing, fallback to mock',
    })
  })

  it('returns an error state when the live corpus request fails with a non-missing status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('should not be called')
      },
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchLiveCorpus()).resolves.toMatchObject({
      status: 'error',
      detail: 'Live corpus error: request failed with status 500',
    })
  })

  it('returns an offline state when the live corpus request fails without a network connection', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('navigator', { onLine: false })

    await expect(fetchLiveCorpus()).resolves.toMatchObject({
      status: 'offline',
      detail: 'Live corpus unavailable offline, fallback to mock',
    })
  })

  it('returns an error state when the live corpus request throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchLiveCorpus()).resolves.toMatchObject({
      status: 'error',
      detail: 'Live corpus error: request failed before a response was returned',
    })
  })

  it('returns an error state when the live corpus payload cannot be parsed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('invalid json')
      },
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchLiveCorpus()).resolves.toMatchObject({
      status: 'error',
      detail: 'Live corpus error: response body could not be parsed',
    })
  })

  it('returns an error state when the live corpus payload has the wrong shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        defaultUserRole: 'analyst',
        providers: [],
        sites: [],
        syncRuns: [],
        documents: [
          {
            id: 'doc-1',
            siteId: 'site-1',
            kind: 'md',
          },
        ],
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchLiveCorpus()).resolves.toMatchObject({
      status: 'error',
      detail: 'Live corpus error: response payload was not a valid corpus',
    })
  })
})
