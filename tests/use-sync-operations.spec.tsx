import { renderHook, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSyncOperations } from '../src/hooks/useSyncOperations'
import { WORKER_SETTINGS_DEFAULTS } from '../src/hooks/useWorkerSettings'

const DEFAULT_OPTIONS = {
  activeScopeLabel: 'All sites',
  extraEnv: {},
  provider: 'openai',
  role: 'analyst',
  visibleDocs: 10,
  syncedSites: 2,
  restrictedSites: 0,
  refreshPolicy: 'daily',
  onRefreshCorpus: vi.fn(),
}

describe('useSyncOperations', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
    sessionStorage.clear()
    localStorage.clear()
  })

  it('cancelActiveJob is a no-op when no job is running', () => {
    const { result } = renderHook(() => useSyncOperations(DEFAULT_OPTIONS))
    expect(result.current.activeJob).toBeNull()
    expect(() => act(() => { result.current.cancelActiveJob() })).not.toThrow()
    expect(result.current.activeJob).toBeNull()
  })

  it('runRefresh is a no-op when a job is already running', async () => {
    vi.stubGlobal('EventSource', vi.fn(() => ({ onmessage: null, onerror: null, close: vi.fn() })))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jobId: 'job-running' }),
    }))

    const { result } = renderHook(() => useSyncOperations(DEFAULT_OPTIONS))

    // Start a live job first
    await act(async () => { result.current.startIngest() })
    await act(async () => {})
    const runningJobId = result.current.activeJob?.id

    // Now try to start refresh — should be ignored
    act(() => { result.current.startRefresh() })
    expect(result.current.activeJob?.id).toBe(runningJobId)
  })

  it('does not start a second job while one is already running', async () => {
    vi.stubGlobal('EventSource', vi.fn(() => ({ onmessage: null, onerror: null, close: vi.fn() })))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jobId: 'job-1' }),
    }))

    const { result } = renderHook(() => useSyncOperations(DEFAULT_OPTIONS))

    await act(async () => { result.current.startIngest() })
    const firstJobId = result.current.activeJob?.id

    await act(async () => { result.current.startIngest() })
    expect(result.current.activeJob?.id).toBe(firstJobId)
  })

  it('lastCompletedJob returns null when no job has run', () => {
    const { result } = renderHook(() => useSyncOperations(DEFAULT_OPTIONS))
    expect(result.current.lastCompletedJob).toBeNull()
  })

  it('persists completed history entries across remounts', async () => {
    vi.useFakeTimers()

    const onRefreshCorpus = vi.fn()
    const options = { ...DEFAULT_OPTIONS, onRefreshCorpus }
    const { result, unmount } = renderHook(() => useSyncOperations(options))

    await act(async () => {
      result.current.startRefresh()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0]?.status).toBe('completed')
    expect(JSON.parse(localStorage.getItem('deepvault_sync_job_history') || '[]')[0].status).toBe('completed')

    unmount()

    const { result: remounted } = renderHook(() => useSyncOperations(options))
    expect(remounted.current.history).toHaveLength(1)
    expect(remounted.current.history[0]?.status).toBe('completed')
  })

  it('keeps only the last 20 lines for active jobs and persisted history', async () => {
    type MockEventSource = {
      onmessage: ((_e: MessageEvent) => void) | null
      onerror: (() => void) | null
      close: ReturnType<typeof vi.fn>
    }

    let mockEs: MockEventSource | null = null

    vi.stubGlobal('EventSource', vi.fn(() => {
      mockEs = { onmessage: null, onerror: null, close: vi.fn() }
      return mockEs
    }))

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jobId: 'job-trim' }),
    }))

    const { result } = renderHook(() => useSyncOperations(DEFAULT_OPTIONS))

    await act(async () => {
      result.current.startIngest()
    })
    await act(async () => {})

    for (let index = 1; index <= 25; index++) {
      await act(async () => {
        mockEs?.onmessage?.({ data: JSON.stringify({ type: 'line', text: `Line ${index}` }) } as MessageEvent)
      })
    }

    const activeLines = result.current.activeJob?.lines ?? []
    expect(activeLines).toHaveLength(20)
    expect(activeLines[0]?.text).toBe('Line 6')
    expect(activeLines[activeLines.length - 1]?.text).toBe('Line 25')

    await act(async () => {
      mockEs?.onmessage?.({ data: JSON.stringify({ type: 'done', exitCode: 0 }) } as MessageEvent)
    })

    const persistedLines = result.current.history[0]?.lines ?? []
    expect(persistedLines).toHaveLength(20)
    expect(persistedLines[0]?.text).toBe('Line 7')
    expect(persistedLines[persistedLines.length - 1]?.text).toBe('Wrote a new local sync snapshot.')
  })

  it('finalizes a stalled live job through watchdog polling', async () => {
    vi.useFakeTimers()

    type MockEventSource = {
      onmessage: ((_e: MessageEvent) => void) | null
      onerror: (() => void) | null
      close: ReturnType<typeof vi.fn>
    }

    let mockEs: MockEventSource | null = null

    vi.stubGlobal('EventSource', vi.fn(() => {
      mockEs = { onmessage: null, onerror: null, close: vi.fn() }
      return mockEs
    }))

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ jobId: 'job-watchdog' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: 'job-watchdog',
          kind: 'ingest',
          status: 'completed',
          startedAt: '2026-04-16T10:00:00.000Z',
          progress: 100,
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSyncOperations(DEFAULT_OPTIONS))

    await act(async () => {
      result.current.startIngest()
    })
    await act(async () => {})

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKER_SETTINGS_DEFAULTS.workerTimeoutSeconds * 1000 + 10)
    })

    expect(result.current.activeJob?.status).toBe('completed')
    expect(result.current.activeJob?.summary).toBe('Wrote a new local sync snapshot.')
    expect(mockEs).not.toBeNull()
    expect(mockEs!.close).toHaveBeenCalled()
  })

  it('surfaces the block-mode worker startup error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const { result } = renderHook(() => useSyncOperations({
      ...DEFAULT_OPTIONS,
      workerSettings: {
        ...WORKER_SETTINGS_DEFAULTS,
        workerFallbackMode: 'block',
      },
    }))

    await act(async () => {
      result.current.startIngest()
    })
    await act(async () => {})

    expect(result.current.activeJob?.status).toBe('failed')
    expect(result.current.activeJob?.summary).toBe('Could not reach the worker. Make sure you are running the Vite dev server.')
  })

  it('passes only the env needed for each worker job kind', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ jobId: 'job-env-scope' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('EventSource', vi.fn(() => ({ onmessage: null, onerror: null, close: vi.fn() })))

    const { result } = renderHook(() => useSyncOperations({
      ...DEFAULT_OPTIONS,
      extraEnv: {
        DEEPVAULT_DATA_MODE: 'live',
        OPENAI_API_KEY: 'openai-key',
        GEMINI_API_KEY: 'gemini-key',
        ANTHROPIC_API_KEY: 'anthropic-key',
        DEEPVAULT_ENTRA_APP_ID: 'app-id',
        DEEPVAULT_ENTRA_TENANT_ID: 'tenant-id',
        DEEPVAULT_ENTRA_SECRET_VALUE: 'entra-secret',
        DEEPVAULT_ENTRA_SITES: 'https://tenant.sharepoint.com/sites/A',
        DEEPVAULT_PILOT_SITE_NAMES: 'Site A',
      },
    }))

    await act(async () => {
      result.current.startIngest()
    })
    await act(async () => {})

    const ingestBody = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as {
      env: Record<string, string>
    }
    expect(ingestBody.env).toEqual({
      DEEPVAULT_DATA_MODE: 'live',
    })

    await act(async () => {
      result.current.cancelActiveJob()
    })

    fetchMock.mockClear()

    await act(async () => {
      result.current.startEvaluate()
    })
    await act(async () => {})

    const evaluateBody = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as {
      env: Record<string, string>
    }
    expect(evaluateBody.env).toEqual({
      DEEPVAULT_DATA_MODE: 'live',
      OPENAI_API_KEY: 'openai-key',
      GEMINI_API_KEY: 'gemini-key',
      ANTHROPIC_API_KEY: 'anthropic-key',
    })
  })

  it('reconnects a persisted job and marks it failed when the stream errors', async () => {
    type MockEventSource = {
      onmessage: ((_e: MessageEvent) => void) | null
      onerror: (() => void) | null
      close: ReturnType<typeof vi.fn>
    }

    let mockEs: MockEventSource | null = null
    sessionStorage.setItem('deepvault_active_job', JSON.stringify({
      serverJobId: 'job-reconnect',
      jobId: 'job-local',
      kind: 'ingest',
      startedAt: '2026-04-16T10:00:00.000Z',
    }))

    vi.stubGlobal('EventSource', vi.fn(() => {
      mockEs = { onmessage: null, onerror: null, close: vi.fn() }
      return mockEs
    }))
    vi.stubGlobal('fetch', vi.fn())

    const { result } = renderHook(() => useSyncOperations(DEFAULT_OPTIONS))

    expect(result.current.activeJob?.status).toBe('running')

    await act(async () => {
      mockEs?.onerror?.()
    })

    expect(result.current.activeJob?.status).toBe('failed')
    expect(result.current.activeJob?.summary).toBe('Could not reconnect to Ingest.')
    expect(sessionStorage.getItem('deepvault_active_job')).toBeNull()
    expect(mockEs).not.toBeNull()
    expect(mockEs!.close).toHaveBeenCalled()
  })
})
