import { renderHook, act } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  useWorkerSettings,
  WORKER_SETTINGS_STORAGE_KEY,
  WORKER_SETTINGS_DEFAULTS,
  WORKER_TOKEN_STORAGE_KEY,
} from '../src/hooks/useWorkerSettings'

describe('useWorkerSettings', () => {
  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('returns defaults when nothing is stored', () => {
    const { result } = renderHook(() => useWorkerSettings())
    expect(result.current.workerSettings.workerMode).toBe('local')
    expect(result.current.workerSettings.workerUrl).toBe('')
    expect(result.current.workerSettings.workerToken).toBe('')
    expect(result.current.workerSettings.workerTimeoutSeconds).toBe(30)
    expect(result.current.workerSettings.workerFallbackMode).toBe('read_only')
  })

  it('reads non-secret values from localStorage', () => {
    localStorage.setItem(
      WORKER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ workerMode: 'remote', workerUrl: 'https://worker.example.com', workerTimeoutSeconds: 60 }),
    )
    const { result } = renderHook(() => useWorkerSettings())
    expect(result.current.workerSettings.workerMode).toBe('remote')
    expect(result.current.workerSettings.workerUrl).toBe('https://worker.example.com')
    expect(result.current.workerSettings.workerTimeoutSeconds).toBe(60)
  })

  it('reads the worker token from sessionStorage', () => {
    localStorage.setItem(
      WORKER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ workerMode: 'remote', workerUrl: 'https://worker.example.com' }),
    )
    sessionStorage.setItem(WORKER_TOKEN_STORAGE_KEY, JSON.stringify({ workerToken: 'secret-token' }))

    const { result } = renderHook(() => useWorkerSettings())
    expect(result.current.workerSettings.workerToken).toBe('secret-token')
  })

  it('rejects invalid workerMode and falls back to local', () => {
    localStorage.setItem(WORKER_SETTINGS_STORAGE_KEY, JSON.stringify({ workerMode: 'cloud' }))
    const { result } = renderHook(() => useWorkerSettings())
    expect(result.current.workerSettings.workerMode).toBe('local')
  })

  it('rejects invalid workerFallbackMode and falls back to read_only', () => {
    localStorage.setItem(WORKER_SETTINGS_STORAGE_KEY, JSON.stringify({ workerFallbackMode: 'unknown' }))
    const { result } = renderHook(() => useWorkerSettings())
    expect(result.current.workerSettings.workerFallbackMode).toBe('read_only')
  })

  it('accepts block and none as valid workerFallbackMode', () => {
    localStorage.setItem(WORKER_SETTINGS_STORAGE_KEY, JSON.stringify({ workerFallbackMode: 'block' }))
    const { result: r1 } = renderHook(() => useWorkerSettings())
    expect(r1.current.workerSettings.workerFallbackMode).toBe('block')

    localStorage.setItem(WORKER_SETTINGS_STORAGE_KEY, JSON.stringify({ workerFallbackMode: 'none' }))
    const { result: r2 } = renderHook(() => useWorkerSettings())
    expect(r2.current.workerSettings.workerFallbackMode).toBe('none')
  })

  it('rejects non-positive timeout and falls back to default', () => {
    localStorage.setItem(WORKER_SETTINGS_STORAGE_KEY, JSON.stringify({ workerTimeoutSeconds: -5 }))
    const { result } = renderHook(() => useWorkerSettings())
    expect(result.current.workerSettings.workerTimeoutSeconds).toBe(WORKER_SETTINGS_DEFAULTS.workerTimeoutSeconds)
  })

  it('returns defaults when stored JSON is invalid', () => {
    localStorage.setItem(WORKER_SETTINGS_STORAGE_KEY, 'not-valid-json')
    const { result } = renderHook(() => useWorkerSettings())
    expect(result.current.workerSettings.workerMode).toBe('local')
  })

  it('updates a field via setWorkerSetting', () => {
    const { result } = renderHook(() => useWorkerSettings())
    act(() => { result.current.setWorkerSetting('workerMode', 'remote') })
    expect(result.current.workerSettings.workerMode).toBe('remote')
  })

  it('updates workerTimeoutSeconds via setWorkerSetting', () => {
    const { result } = renderHook(() => useWorkerSettings())
    act(() => { result.current.setWorkerSetting('workerTimeoutSeconds', 120) })
    expect(result.current.workerSettings.workerTimeoutSeconds).toBe(120)
  })

  it('clears all settings via clearWorkerSettings', () => {
    localStorage.setItem(
      WORKER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ workerMode: 'remote', workerUrl: 'https://w.example.com', workerTimeoutSeconds: 90 }),
    )
    const { result } = renderHook(() => useWorkerSettings())
    act(() => { result.current.clearWorkerSettings() })
    expect(result.current.workerSettings.workerMode).toBe('local')
    expect(result.current.workerSettings.workerUrl).toBe('')
    expect(result.current.workerSettings.workerTimeoutSeconds).toBe(30)
  })

  it('persists non-secret settings to localStorage and the token to sessionStorage', () => {
    const { result } = renderHook(() => useWorkerSettings())
    act(() => { result.current.setWorkerSetting('workerUrl', 'https://worker.example.com') })
    act(() => { result.current.setWorkerSetting('workerToken', 'secret-token') })
    const stored = JSON.parse(localStorage.getItem(WORKER_SETTINGS_STORAGE_KEY) ?? '{}') as Record<string, unknown>
    const storedToken = JSON.parse(sessionStorage.getItem(WORKER_TOKEN_STORAGE_KEY) ?? '{}') as Record<string, unknown>
    expect(stored.workerUrl).toBe('https://worker.example.com')
    expect(stored.workerToken).toBeUndefined()
    expect(storedToken.workerToken).toBe('secret-token')
  })
})
