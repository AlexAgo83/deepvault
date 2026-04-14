import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTheme } from '../src/hooks/useTheme'

describe('useTheme', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('defaults to light when no stored preference and system is light', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
  })

  it('defaults to dark when no stored preference and system is dark', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
  })

  it('restores light theme from localStorage', () => {
    localStorage.setItem('deepvault_theme', 'light')
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
  })

  it('restores dark theme from localStorage', () => {
    localStorage.setItem('deepvault_theme', 'dark')
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
  })

  it('applies data-theme attribute on mount', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    renderHook(() => useTheme())
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('applies data-theme="dark" on mount when dark is resolved', () => {
    localStorage.setItem('deepvault_theme', 'dark')
    renderHook(() => useTheme())
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('toggles from light to dark', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')

    act(() => { result.current.toggleTheme() })

    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('toggles from dark to light', () => {
    localStorage.setItem('deepvault_theme', 'dark')
    const { result } = renderHook(() => useTheme())

    act(() => { result.current.toggleTheme() })

    expect(result.current.theme).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('persists the selected theme to localStorage on toggle', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    const { result } = renderHook(() => useTheme())

    act(() => { result.current.toggleTheme() })

    expect(localStorage.getItem('deepvault_theme')).toBe('dark')

    act(() => { result.current.toggleTheme() })

    expect(localStorage.getItem('deepvault_theme')).toBe('light')
  })

  it('ignores an invalid stored value and falls back to system preference', () => {
    localStorage.setItem('deepvault_theme', 'purple')
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
  })
})
