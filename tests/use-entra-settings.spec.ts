import { renderHook, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  useEntraSettings,
  ENTRA_SETTINGS_STORAGE_KEY,
  ENTRA_SETTINGS_SECRET_STORAGE_KEY,
} from '../src/hooks/useEntraSettings'

describe('useEntraSettings', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('returns empty defaults when nothing is stored', () => {
    const { result } = renderHook(() => useEntraSettings())
    expect(result.current.entraSettings.appId).toBe('')
    expect(result.current.entraSettings.tenantId).toBe('')
    expect(result.current.entraSettings.secretValue).toBe('')
    expect(result.current.entraSettings.sites).toBe('')
    expect(result.current.entraSettings.siteNames).toBe('')
    expect(result.current.entraSettings.dataMode).toBe('')
  })

  it('reads stored values from localStorage', () => {
    localStorage.setItem(ENTRA_SETTINGS_STORAGE_KEY, JSON.stringify({ appId: 'abc123', dataMode: 'live' }))
    const { result } = renderHook(() => useEntraSettings())
    expect(result.current.entraSettings.appId).toBe('abc123')
    expect(result.current.entraSettings.dataMode).toBe('live')
  })

  it('reads the client secret from sessionStorage', () => {
    localStorage.setItem(ENTRA_SETTINGS_STORAGE_KEY, JSON.stringify({ appId: 'abc123', dataMode: 'live' }))
    sessionStorage.setItem(ENTRA_SETTINGS_SECRET_STORAGE_KEY, JSON.stringify({ secretValue: 'super-secret' }))

    const { result } = renderHook(() => useEntraSettings())
    expect(result.current.entraSettings.secretValue).toBe('super-secret')
    expect(sessionStorage.getItem(ENTRA_SETTINGS_SECRET_STORAGE_KEY)).toBeNull()
    expect(JSON.parse(localStorage.getItem(ENTRA_SETTINGS_SECRET_STORAGE_KEY) ?? '{}')).toEqual({ secretValue: 'super-secret' })
  })

  it('reads the client secret from localStorage', () => {
    localStorage.setItem(ENTRA_SETTINGS_STORAGE_KEY, JSON.stringify({ appId: 'abc123', dataMode: 'live' }))
    localStorage.setItem(ENTRA_SETTINGS_SECRET_STORAGE_KEY, JSON.stringify({ secretValue: 'super-secret' }))

    const { result } = renderHook(() => useEntraSettings())
    expect(result.current.entraSettings.secretValue).toBe('super-secret')
  })

  it('accepts mock as a valid dataMode', () => {
    localStorage.setItem(ENTRA_SETTINGS_STORAGE_KEY, JSON.stringify({ dataMode: 'mock' }))
    const { result } = renderHook(() => useEntraSettings())
    expect(result.current.entraSettings.dataMode).toBe('mock')
  })

  it('rejects invalid dataMode values and falls back to empty string', () => {
    localStorage.setItem(ENTRA_SETTINGS_STORAGE_KEY, JSON.stringify({ dataMode: 'staging' }))
    const { result } = renderHook(() => useEntraSettings())
    expect(result.current.entraSettings.dataMode).toBe('')
  })

  it('returns empty defaults when stored JSON is invalid', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(ENTRA_SETTINGS_STORAGE_KEY, 'not-valid-json')
    const { result } = renderHook(() => useEntraSettings())
    expect(result.current.entraSettings.appId).toBe('')
    expect(warnSpy).toHaveBeenCalled()
  })

  it('updates a specific field via setEntraSetting', () => {
    const { result } = renderHook(() => useEntraSettings())
    act(() => { result.current.setEntraSetting('appId', '  new-app-id  ') })
    expect(result.current.entraSettings.appId).toBe('new-app-id')
  })

  it('updates dataMode via setEntraSetting', () => {
    const { result } = renderHook(() => useEntraSettings())
    act(() => { result.current.setEntraSetting('dataMode', 'live') })
    expect(result.current.entraSettings.dataMode).toBe('live')
  })

  it('clears all settings via clearEntraSettings', () => {
    localStorage.setItem(ENTRA_SETTINGS_STORAGE_KEY, JSON.stringify({ appId: 'abc', tenantId: 'xyz', dataMode: 'live' }))
    const { result } = renderHook(() => useEntraSettings())
    act(() => { result.current.clearEntraSettings() })
    expect(result.current.entraSettings.appId).toBe('')
    expect(result.current.entraSettings.tenantId).toBe('')
    expect(result.current.entraSettings.dataMode).toBe('')
  })

  it('persists non-secret values and the client secret to localStorage', () => {
    const { result } = renderHook(() => useEntraSettings())
    act(() => { result.current.setEntraSetting('tenantId', 'tenant-123') })
    act(() => { result.current.setEntraSetting('secretValue', 'super-secret') })
    const stored = JSON.parse(localStorage.getItem(ENTRA_SETTINGS_STORAGE_KEY) ?? '{}') as Record<string, string>
    const storedSecret = JSON.parse(localStorage.getItem(ENTRA_SETTINGS_SECRET_STORAGE_KEY) ?? '{}') as Record<string, string>
    expect(stored.tenantId).toBe('tenant-123')
    expect(stored.secretValue).toBeUndefined()
    expect(storedSecret.secretValue).toBe('super-secret')
  })
})
