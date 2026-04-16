import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  BISHOP_SETTINGS_DEFAULTS,
  BISHOP_SETTINGS_STORAGE_KEY,
  useBishopSettings,
} from '../src/hooks/useBishopSettings'

describe('useBishopSettings', () => {
  it('uses defaults when storage is empty', () => {
    localStorage.clear()

    const { result } = renderHook(() => useBishopSettings())

    expect(result.current.bishopSettings).toEqual(BISHOP_SETTINGS_DEFAULTS)
  })

  it('reads stored values from localStorage', () => {
    localStorage.setItem(
      BISHOP_SETTINGS_STORAGE_KEY,
      JSON.stringify({ sourceLimit: 5, candidateLimit: 12, historyTurnLimit: 7 }),
    )

    const { result } = renderHook(() => useBishopSettings())

    expect(result.current.bishopSettings).toEqual({
      sourceLimit: 5,
      candidateLimit: 12,
      historyTurnLimit: 7,
    })
  })

  it('clamps invalid stored values into safe bounds', () => {
    localStorage.setItem(
      BISHOP_SETTINGS_STORAGE_KEY,
      JSON.stringify({ sourceLimit: 99, candidateLimit: 1, historyTurnLimit: -5 }),
    )

    const { result } = renderHook(() => useBishopSettings())

    expect(result.current.bishopSettings).toEqual({
      sourceLimit: 8,
      candidateLimit: 8,
      historyTurnLimit: 0,
    })
  })

  it('persists updates to localStorage', () => {
    localStorage.clear()
    const { result } = renderHook(() => useBishopSettings())

    act(() => {
      result.current.setBishopSetting('sourceLimit', 6)
      result.current.setBishopSetting('candidateLimit', 14)
      result.current.setBishopSetting('historyTurnLimit', 4)
    })

    expect(JSON.parse(localStorage.getItem(BISHOP_SETTINGS_STORAGE_KEY) || '{}')).toEqual({
      sourceLimit: 6,
      candidateLimit: 14,
      historyTurnLimit: 4,
    })
  })

  it('resets values through clearBishopSettings', () => {
    localStorage.setItem(
      BISHOP_SETTINGS_STORAGE_KEY,
      JSON.stringify({ sourceLimit: 5, candidateLimit: 12, historyTurnLimit: 7 }),
    )

    const { result } = renderHook(() => useBishopSettings())

    act(() => {
      result.current.clearBishopSettings()
    })

    expect(result.current.bishopSettings).toEqual(BISHOP_SETTINGS_DEFAULTS)
  })
})
