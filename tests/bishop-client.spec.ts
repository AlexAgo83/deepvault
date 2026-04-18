import { afterEach, describe, expect, it, vi } from 'vitest'
import { askBishop } from '../src/lib/bishop-client'

describe('askBishop', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('attaches the bearer token when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'answered',
        provider: 'openai',
        query: 'What changed?',
        answer: 'A valid answer.',
        sources: [],
        deniedSources: [],
        chunkCount: 0,
        tokenCount: 0,
        latencyMs: 10,
        confidence: 80,
        trace: {
          mode: 'remote',
          providerTracePreview: '',
          prompt: '',
        },
      }),
    })

    await askBishop('What changed?', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      accessToken: 'access-token',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bishop/query',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    )
  })
})
