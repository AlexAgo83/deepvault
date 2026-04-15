import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportSiteCorpus, GraphClient } from '../scripts/deepvault-graph'

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

  it('skips unchanged documents when a delta checkpoint is provided', async () => {
    const client = {
      getJson: vi.fn(async (path: string) => {
        if (path.includes('/sites/') && !path.includes('/drives') && !path.includes('/lists')) {
          return { id: 'site-1', displayName: 'Pilot', webUrl: 'https://example.sharepoint.com/sites/pilot' }
        }
        throw new Error(`unexpected getJson path: ${path}`)
      }),
      listAll: vi.fn(async (path: string) => {
        if (path.includes('/children')) {
          return [
            {
              id: 'doc-old',
              name: 'old.txt',
              file: { mimeType: 'text/plain' },
              lastModifiedDateTime: '2026-04-10T10:00:00.000Z',
              size: 20,
            },
            {
              id: 'doc-new',
              name: 'new.txt',
              file: { mimeType: 'text/plain' },
              lastModifiedDateTime: '2026-04-11T12:00:00.000Z',
              size: 20,
            },
          ]
        }
        if (path.includes('/drives')) {
          return [{ id: 'drive-1', name: 'Docs' }]
        }
        if (path.includes('/lists')) {
          return [{ id: 'list-1' }]
        }
        throw new Error(`unexpected listAll path: ${path}`)
      }),
      getText: vi.fn(async () => ({ text: 'Updated content', contentType: 'text/plain' })),
    }

    const result = await exportSiteCorpus(
      client as unknown as GraphClient,
      { url: 'https://example.sharepoint.com/sites/pilot', name: 'Pilot' },
      undefined,
      { updatedAfter: '2026-04-11T11:00:00.000Z' },
    )

    expect(result.documents).toHaveLength(1)
    expect(result.documents[0]).toMatchObject({ title: 'new', path: '/Docs/new.txt' })
    expect(result.skippedDocuments).toBe(1)
  })

  it('captures creator and last modifier names when Graph provides them', async () => {
    const client = {
      getJson: vi.fn(async (path: string) => {
        if (path.includes('/sites/') && !path.includes('/drives') && !path.includes('/lists')) {
          return { id: 'site-1', displayName: 'Pilot', webUrl: 'https://example.sharepoint.com/sites/pilot' }
        }
        throw new Error(`unexpected getJson path: ${path}`)
      }),
      listAll: vi.fn(async (path: string) => {
        if (path.includes('/children')) {
          return [
            {
              id: 'doc-1',
              name: 'plan.txt',
              file: { mimeType: 'text/plain' },
              lastModifiedDateTime: '2026-04-11T12:00:00.000Z',
              createdBy: { user: { displayName: 'Alice Martin' } },
              lastModifiedBy: { user: { displayName: 'Bob Dupont' } },
              size: 20,
            },
          ]
        }
        if (path.includes('/drives')) {
          return [{ id: 'drive-1', name: 'Docs' }]
        }
        if (path.includes('/lists')) {
          return [{ id: 'list-1' }]
        }
        throw new Error(`unexpected listAll path: ${path}`)
      }),
      getText: vi.fn(async () => ({ text: 'Project plan', contentType: 'text/plain' })),
    }

    const result = await exportSiteCorpus(
      client as unknown as GraphClient,
      { url: 'https://example.sharepoint.com/sites/pilot', name: 'Pilot' },
    )

    expect(result.documents[0]).toMatchObject({
      createdBy: 'Alice Martin',
      lastModifiedBy: 'Bob Dupont',
    })
  })
})
