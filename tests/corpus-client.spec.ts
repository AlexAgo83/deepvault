import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchLiveCorpus } from '../src/lib/corpus-client'

describe('fetchLiveCorpus', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('attaches the bearer token when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        schemaVersion: '1.1',
        defaultUserRole: 'analyst',
        providers: [],
        sites: [],
        syncRuns: [],
        documents: [],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchLiveCorpus('access-token')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/corpus',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    )
  })
})
