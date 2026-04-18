import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeCorpusMode } from '../src/lib/corpus-mode'
import { fetchLiveCorpus, getMockCorpusBundle, isCorpusLike } from '../src/lib/corpus-client'

describe('corpus helpers', () => {
  afterEach(() => {
    window.localStorage.clear()
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
    expect(normalizeCorpusMode('live')).toBe('live')
    expect(normalizeCorpusMode('mock')).toBe('mock')
    expect(normalizeCorpusMode(undefined)).toBe('mock')
    expect(normalizeCorpusMode(null)).toBe('mock')
  })

  it('returns the live corpus when fetch succeeds', async () => {
    const { corpus } = getMockCorpusBundle()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue('etag-1') },
      json: async () => corpus,
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchLiveCorpus()).resolves.toMatchObject({ status: 'loaded', corpus })
    expect(fetchMock).toHaveBeenCalledWith('/api/corpus', { cache: 'no-store', headers: {} })
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
      detail: 'Worker corpus missing, fallback to mock',
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
      detail: 'Worker corpus missing, fallback to mock',
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
      detail: 'Worker corpus error: request failed with status 500',
    })
  })

  it('returns an offline state when the live corpus request fails without a network connection', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('navigator', { onLine: false })

    await expect(fetchLiveCorpus()).resolves.toMatchObject({
      status: 'offline',
      detail: 'Worker corpus unavailable offline and no successful fetch is cached yet',
    })
  })

  it('returns an error state when the live corpus request throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchLiveCorpus()).resolves.toMatchObject({
      status: 'error',
      detail: 'Worker corpus request failed before a response was returned',
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
      detail: 'Worker corpus error: response body could not be parsed',
    })
  })

  it('returns an error state when the live corpus payload has the wrong shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: '1.1',
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
      detail: 'Worker corpus error: response payload was not a valid corpus',
    })
  })

  it('reuses the cached corpus when the worker responds 304 not modified', async () => {
    const { corpus } = getMockCorpusBundle()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue('etag-304') },
        json: async () => corpus,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 304,
        headers: { get: vi.fn().mockReturnValue('etag-304') },
        json: async () => {
          throw new Error('should not be called')
        },
      })

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchLiveCorpus()).resolves.toMatchObject({ status: 'loaded', detail: 'Worker corpus loaded' })
    await expect(fetchLiveCorpus()).resolves.toMatchObject({ status: 'loaded', detail: 'Live corpus unchanged', corpus })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/corpus', {
      cache: 'no-store',
      headers: { 'If-None-Match': 'etag-304' },
    })
  })

  it('accepts a valid corpus shape with optional analysis metadata', () => {
    const { corpus } = getMockCorpusBundle()
    const candidate = {
      ...corpus,
      documents: [
        {
          ...corpus.documents[0],
          sections: [
            { heading: 'Summary', content: 'Ready' },
            { heading: 'Details', content: 'Covered' },
          ],
          analysis: {
            status: 'analyzed',
            version: '1',
            provider: 'openai',
            model: 'gpt-5.4',
            analyzedAt: '2026-04-17T10:00:00.000Z',
            contentHash: 'abc',
            summary: 'ok',
            documentType: 'note',
            confidence: 0.9,
            keywords: ['alpha', 'beta'],
            sections: [{ heading: 'Summary', content: 'Ready' }],
          },
        },
      ],
    }

    expect(isCorpusLike(candidate)).toBe(true)
  })

  it('rejects malformed top-level corpus metadata', () => {
    const { corpus } = getMockCorpusBundle()

    expect(isCorpusLike(null)).toBe(false)
    expect(isCorpusLike({ ...corpus, schemaVersion: '   ' })).toBe(false)
    expect(isCorpusLike({ ...corpus, defaultUserRole: 'owner' })).toBe(false)
    expect(isCorpusLike({ ...corpus, providers: 'nope' })).toBe(false)
  })

  it('rejects unsupported site and sync statuses', () => {
    const { corpus } = getMockCorpusBundle()

    expect(
      isCorpusLike({
        ...corpus,
        sites: [{ ...corpus.sites[0], status: 'archived' }],
      }),
    ).toBe(false)

    expect(
      isCorpusLike({
        ...corpus,
        syncRuns: [{ ...corpus.syncRuns[0], status: 'archived' }],
      }),
    ).toBe(false)
  })

  it('rejects malformed document analysis and section fields', () => {
    const { corpus } = getMockCorpusBundle()
    const baseDocument = corpus.documents[0]

    expect(
      isCorpusLike({
        ...corpus,
        documents: [{ ...baseDocument, tags: ['ok'], access: ['team'], sections: [{ heading: 42, content: 'bad' }] }],
      }),
    ).toBe(false)

    expect(
      isCorpusLike({
        ...corpus,
        documents: [
          {
            ...baseDocument,
            analysis: 42,
          },
        ],
      }),
    ).toBe(false)

    expect(
      isCorpusLike({
        ...corpus,
        documents: [
          {
            ...baseDocument,
            analysis: {
              status: 'analyzed',
              version: '1',
              keywords: ['ok', 42],
            },
          },
        ],
      }),
    ).toBe(false)

    expect(
      isCorpusLike({
        ...corpus,
        documents: [
          {
            ...baseDocument,
            analysis: {
              status: 'unknown',
              version: '1',
            },
          },
        ],
      }),
    ).toBe(false)
  })
})
