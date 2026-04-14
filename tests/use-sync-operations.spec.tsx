import { renderHook, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSyncOperations } from '../src/hooks/useSyncOperations'

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
    sessionStorage.clear()
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
})
