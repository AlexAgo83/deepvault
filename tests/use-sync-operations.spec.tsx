import { renderHook, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSyncOperations } from '../src/hooks/useSyncOperations'
import { WORKER_SETTINGS_DEFAULTS } from '../src/hooks/useWorkerSettings'
import { listAIUsageEvents } from '../src/lib/ai-usage'

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

  it('ignores invalid persisted history payloads on mount', () => {
    localStorage.setItem('deepvault_sync_job_history', '{invalid-json')

    const { result } = renderHook(() => useSyncOperations(DEFAULT_OPTIONS))

    expect(result.current.history).toEqual([])
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

  it('falls back to the read-only worker message when startup throws without a usable detail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('')))

    const { result } = renderHook(() => useSyncOperations({
      ...DEFAULT_OPTIONS,
      workerSettings: {
        ...WORKER_SETTINGS_DEFAULTS,
        workerFallbackMode: 'read_only',
      },
    }))

    await act(async () => {
      result.current.startExportLive()
    })
    await act(async () => {})

    expect(result.current.activeJob?.status).toBe('failed')
    expect(result.current.activeJob?.summary).toBe('Could not reach the worker. Staying on the published corpus in read-only mode.')
  })

  it('surfaces the worker startup error details when the worker returns them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ error: 'AADSTS7000215: Invalid client secret provided.' })),
    }))

    const { result } = renderHook(() => useSyncOperations(DEFAULT_OPTIONS))

    await act(async () => {
      result.current.startExportLive()
    })
    await act(async () => {})

    expect(result.current.activeJob?.status).toBe('failed')
    expect(result.current.activeJob?.summary).toBe('Failed to start job: 400: AADSTS7000215: Invalid client secret provided.')
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
        DEEPVAULT_ENTRA_AUTH_MODE: 'application',
        DEEPVAULT_ENTRA_BASE_URL: 'https://graph.microsoft.com/v1.0',
        DEEPVAULT_ENTRA_TIMEOUT_SECONDS: '45',
        DEEPVAULT_ENTRA_SCOPES: 'Sites.Read.All,Files.Read.All',
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
      type: string
      options: { env: Record<string, string> }
    }
    expect(ingestBody.type).toBe('ingest')
    expect(ingestBody.options.env).toEqual({
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
      type: string
      options: { env: Record<string, string> }
    }
    expect(evaluateBody.type).toBe('evaluate')
    expect(evaluateBody.options.env).toEqual({
      DEEPVAULT_DATA_MODE: 'live',
      OPENAI_API_KEY: 'openai-key',
      GEMINI_API_KEY: 'gemini-key',
      ANTHROPIC_API_KEY: 'anthropic-key',
    })

    await act(async () => {
      result.current.cancelActiveJob()
    })

    fetchMock.mockClear()

    await act(async () => {
      result.current.startAnalyze()
    })
    await act(async () => {})

    const analyzeBody = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as {
      type: string
      options: { env: Record<string, string> }
    }
    expect(analyzeBody.type).toBe('analyze')
    expect(analyzeBody.options.env).toEqual({
      DEEPVAULT_DATA_MODE: 'live',
      OPENAI_API_KEY: 'openai-key',
      GEMINI_API_KEY: 'gemini-key',
      ANTHROPIC_API_KEY: 'anthropic-key',
      DEEPVAULT_ANALYZE_PROVIDER: 'openai',
      DEEPVAULT_ANALYZE_LIMIT: '12',
    })

    await act(async () => {
      result.current.cancelActiveJob()
    })

    fetchMock.mockClear()

    await act(async () => {
      result.current.startPublishAnalysis()
    })
    await act(async () => {})

    const publishBody = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as {
      type: string
      options: { env: Record<string, string> }
    }
    expect(publishBody.type).toBe('analyze')
    expect(publishBody.options.env).toEqual({
      DEEPVAULT_DATA_MODE: 'live',
    })

    await act(async () => {
      result.current.cancelActiveJob()
    })

    fetchMock.mockClear()

    await act(async () => {
      result.current.startExportLiveResume()
    })
    await act(async () => {})

    const exportResumeBody = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as {
      type: string
      options: { env: Record<string, string> }
    }
    expect(exportResumeBody.type).toBe('export-live')
    expect(exportResumeBody.options.env).toEqual({
      DEEPVAULT_DATA_MODE: 'live',
      DEEPVAULT_EXPORT_LIVE_RESUME: '1',
      DEEPVAULT_ENTRA_AUTH_MODE: 'application',
      DEEPVAULT_ENTRA_BASE_URL: 'https://graph.microsoft.com/v1.0',
      DEEPVAULT_ENTRA_TIMEOUT_SECONDS: '45',
      DEEPVAULT_ENTRA_SCOPES: 'Sites.Read.All,Files.Read.All',
      DEEPVAULT_ENTRA_APP_ID: 'app-id',
      DEEPVAULT_ENTRA_TENANT_ID: 'tenant-id',
      DEEPVAULT_ENTRA_SECRET_VALUE: 'entra-secret',
      DEEPVAULT_ENTRA_SITES: 'https://tenant.sharepoint.com/sites/A',
      DEEPVAULT_PILOT_SITE_NAMES: 'Site A',
    })
  })

  it('starts publish analysis with the dedicated command header', async () => {
    vi.stubGlobal('EventSource', vi.fn(() => ({ onmessage: null, onerror: null, close: vi.fn() })))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ jobId: 'job-publish-analysis' }),
    }))

    const { result } = renderHook(() => useSyncOperations(DEFAULT_OPTIONS))

    await act(async () => {
      result.current.startPublishAnalysis()
    })
    await act(async () => {})

    expect(result.current.activeJob?.command).toBe('npm run analyze:publish')
    expect(result.current.activeJob?.label).toBe('Publish analysis')
    expect(result.current.activeJob?.lines[0]?.text).toContain('$ npm run analyze:publish')
  })

  it('shows the analyze budget in the analyze command header', async () => {
    vi.stubGlobal('EventSource', vi.fn(() => ({ onmessage: null, onerror: null, close: vi.fn() })))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ jobId: 'job-analyze-budget' }),
    }))

    const { result } = renderHook(() => useSyncOperations({
      ...DEFAULT_OPTIONS,
      workerSettings: {
        ...WORKER_SETTINGS_DEFAULTS,
        analyzeLimit: 50,
      },
    }))

    await act(async () => {
      result.current.startAnalyze()
    })
    await act(async () => {})

    expect(result.current.activeJob?.lines[0]?.text).toContain('Analyze budget: 50 documents')
  })

  it('records analyze token usage in the shared AI usage store when the run completes with actual tokens', async () => {
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
      status: 201,
      json: () => Promise.resolve({ jobId: 'job-analyze-usage' }),
    }))

    const { result } = renderHook(() => useSyncOperations(DEFAULT_OPTIONS))

    await act(async () => {
      result.current.startAnalyze()
    })
    await act(async () => {})

    await act(async () => {
      mockEs?.onmessage?.({ data: JSON.stringify({ type: 'line', text: 'Model: gpt-5.4-mini' }) } as MessageEvent)
    })
    await act(async () => {
      mockEs?.onmessage?.({ data: JSON.stringify({ type: 'line', text: 'Actual input tokens: 120' }) } as MessageEvent)
    })
    await act(async () => {
      mockEs?.onmessage?.({ data: JSON.stringify({ type: 'line', text: 'Actual output tokens: 45' }) } as MessageEvent)
    })
    await act(async () => {
      mockEs?.onmessage?.({ data: JSON.stringify({ type: 'done', exitCode: 0 }) } as MessageEvent)
    })
    await act(async () => {})

    const events = listAIUsageEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      source: 'analyze',
      sourceEventId: expect.stringContaining('analyze-job-analyze-'),
      provider: 'openai',
      model: 'gpt-5.4-mini',
      status: 'analyze_completed',
      usageKind: 'provider',
      inputTokenCount: 120,
      outputTokenCount: 45,
      totalTokenCount: 165,
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

  it('marks a live job as failed when its event stream errors', async () => {
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
      status: 201,
      json: () => Promise.resolve({ jobId: 'job-stream-error' }),
    }))

    const { result } = renderHook(() => useSyncOperations(DEFAULT_OPTIONS))

    await act(async () => {
      result.current.startEvaluate()
    })
    await act(async () => {})

    await act(async () => {
      mockEs?.onerror?.()
    })

    expect(result.current.activeJob?.status).toBe('failed')
    expect(result.current.activeJob?.summary).toBe('Evaluate failed.')
    expect(sessionStorage.getItem('deepvault_active_job')).toBeNull()
    expect(mockEs).not.toBeNull()
    expect(mockEs!.close).toHaveBeenCalled()
  })

  it('cancels a refresh job even when no worker job id exists', async () => {
    vi.useFakeTimers()
    const onRefreshCorpus = vi.fn()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSyncOperations({
      ...DEFAULT_OPTIONS,
      onRefreshCorpus,
    }))

    await act(async () => {
      result.current.startRefresh()
    })

    expect(result.current.activeJob?.status).toBe('running')

    act(() => {
      result.current.cancelActiveJob()
    })

    expect(result.current.activeJob?.status).toBe('cancelled')
    expect(result.current.activeJob?.summary).toBe('Refresh cancelled.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses worker job notes when a live job ends with a non-zero exit code', async () => {
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
        json: () => Promise.resolve({ jobId: 'job-export-live' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: 'job-export-live',
          kind: 'export-live',
          status: 'failed',
          startedAt: '2026-04-16T10:00:00.000Z',
          progress: 100,
          notes: 'Auth request failed (401): invalid_client',
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSyncOperations(DEFAULT_OPTIONS))

    await act(async () => {
      result.current.startExportLive()
    })
    await act(async () => {})

    await act(async () => {
      mockEs?.onmessage?.({ data: JSON.stringify({ type: 'done', exitCode: 1 }) } as MessageEvent)
    })
    await act(async () => {})

    expect(result.current.activeJob?.status).toBe('failed')
    expect(result.current.activeJob?.summary).toBe('Auth request failed (401): invalid_client')
    expect(mockEs).not.toBeNull()
    expect(mockEs!.close).toHaveBeenCalled()
  })

  it('does not append duplicate generic failure lines when a failed job is finalized repeatedly', async () => {
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
        json: () => Promise.resolve({ jobId: 'job-repeat-failure' }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: 'job-repeat-failure',
          kind: 'export-live',
          status: 'failed',
          startedAt: '2026-04-16T10:00:00.000Z',
          progress: 100,
          notes: 'Auth request failed (401): invalid_client',
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSyncOperations(DEFAULT_OPTIONS))

    await act(async () => {
      result.current.startExportLive()
    })
    await act(async () => {})

    await act(async () => {
      mockEs?.onmessage?.({ data: JSON.stringify({ type: 'done', exitCode: 1 }) } as MessageEvent)
    })
    await act(async () => {})

    await act(async () => {
      mockEs?.onerror?.()
    })

    const failureLines = (result.current.activeJob?.lines || []).filter((line) => line.text === 'Operation failed.')
    expect(failureLines).toHaveLength(1)
    expect(result.current.activeJob?.summary).toBe('Auth request failed (401): invalid_client')
  })
})
