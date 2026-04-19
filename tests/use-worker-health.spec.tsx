import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorkerHealth } from '../src/hooks/useWorkerHealth'
import type { WorkerSettings } from '../src/hooks/useWorkerSettings'

const LOCAL_SETTINGS: WorkerSettings = {
  workerMode: 'local',
  workerUrl: '',
  workerToken: '',
  workerTimeoutSeconds: 30,
  workerFallbackMode: 'read_only',
  analyzeLimit: 12,
}

const REMOTE_SETTINGS: WorkerSettings = {
  workerMode: 'remote',
  workerUrl: 'https://worker.example.com',
  workerToken: 'secret-token',
  workerTimeoutSeconds: 30,
  workerFallbackMode: 'read_only',
  analyzeLimit: 12,
}

describe('useWorkerHealth', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('reports local mode without checking the worker', () => {
    const { result } = renderHook(() => useWorkerHealth(LOCAL_SETTINGS))

    expect(result.current.status).toBe('local')
    expect(result.current.label).toBe('Local worker')
  })

  it('flags a missing remote URL as misconfigured', () => {
    const { result } = renderHook(() => useWorkerHealth({ ...REMOTE_SETTINGS, workerUrl: '' }))

    expect(result.current.status).toBe('misconfigured')
    expect(result.current.detail).toMatch(/https worker URL/)
  })

  it('flags a non-https remote URL as misconfigured', () => {
    const { result } = renderHook(() => useWorkerHealth({ ...REMOTE_SETTINGS, workerUrl: 'http://worker.example.com' }))

    expect(result.current.status).toBe('misconfigured')
    expect(result.current.detail).toMatch(/localhost for local Docker testing/)
  })

  it('accepts a localhost http remote URL for local Docker testing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        workerVersion: '1.5.0',
        mode: 'remote',
        timestamp: '2026-04-19T00:00:00Z',
      }),
    }))

    const { result } = renderHook(() => useWorkerHealth({ ...REMOTE_SETTINGS, workerUrl: 'http://localhost:8001' }))

    await waitFor(() => expect(result.current.status).toBe('reachable'))
  })

  it('flags a missing remote token as misconfigured', () => {
    const { result } = renderHook(() => useWorkerHealth({ ...REMOTE_SETTINGS, workerToken: '' }))

    expect(result.current.status).toBe('misconfigured')
    expect(result.current.detail).toMatch(/worker token/)
  })

  it('reports an unreachable worker when the health check fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const { result } = renderHook(() => useWorkerHealth(REMOTE_SETTINGS))

    await waitFor(() => expect(result.current.status).toBe('unreachable'))
    expect(result.current.detail).toBe('Network error')
  })
})
