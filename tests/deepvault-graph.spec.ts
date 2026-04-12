import { afterEach, describe, expect, it, vi } from 'vitest'
import { GraphClient } from '../scripts/deepvault-graph'

function makeJsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] || headers[name] || null
      },
    },
    async text() {
      return JSON.stringify(body)
    },
  } as Response
}

describe('GraphClient', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('retries transient Graph failures before succeeding', async () => {
    vi.useFakeTimers()

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeJsonResponse(503, { error: 'temporary' }, { 'retry-after': '1' }))
      .mockResolvedValueOnce(makeJsonResponse(200, { value: [] }))

    vi.stubGlobal('fetch', fetchMock)

    const client = new GraphClient('https://graph.microsoft.com/v1.0', 'token', 30)
    const promise = client.getJson<{ value: unknown[] }>('/me')

    await vi.advanceTimersByTimeAsync(1000)

    await expect(promise).resolves.toEqual({ value: [] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('aborts Graph requests after the configured timeout', async () => {
    vi.useFakeTimers()

    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')))
      }) as Promise<Response>
    })

    vi.stubGlobal('fetch', fetchMock)

    const client = new GraphClient('https://graph.microsoft.com/v1.0', 'token', 1)
    const promise = client.getJson('/me')
    const expectation = expect(promise).rejects.toThrow('aborted')

    await vi.advanceTimersByTimeAsync(1000)

    await expectation
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
