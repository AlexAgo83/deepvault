import { useEffect, useState } from 'react'
import { isRecord, parseStoredJsonOrNull } from '../lib/storage-schema'

export const BISHOP_SETTINGS_STORAGE_KEY = 'deepvault_bishop_settings'

export interface BishopSettings {
  sourceLimit: number
  candidateLimit: number
  historyTurnLimit: number
}

export const BISHOP_SETTINGS_DEFAULTS: BishopSettings = {
  sourceLimit: 3,
  candidateLimit: 10,
  historyTurnLimit: 12,
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  const rounded = Math.round(value)
  return Math.min(maximum, Math.max(minimum, rounded))
}

function readBishopSettings(): BishopSettings {
  if (typeof window === 'undefined') {
    return BISHOP_SETTINGS_DEFAULTS
  }

  const raw = window.localStorage.getItem(BISHOP_SETTINGS_STORAGE_KEY)
  if (!raw) {
    return BISHOP_SETTINGS_DEFAULTS
  }

  const parsed = parseStoredJsonOrNull(raw, {
    storageKey: BISHOP_SETTINGS_STORAGE_KEY,
    validate: (value) => {
      if (!isRecord(value)) {
        return null
      }

      return {
        sourceLimit: typeof value.sourceLimit === 'number' ? value.sourceLimit : undefined,
        candidateLimit: typeof value.candidateLimit === 'number' ? value.candidateLimit : undefined,
        historyTurnLimit: typeof value.historyTurnLimit === 'number' ? value.historyTurnLimit : undefined,
      }
    },
  })
  if (!parsed) {
    return BISHOP_SETTINGS_DEFAULTS
  }

  const sourceLimit = clampInteger(parsed.sourceLimit, 1, 8, BISHOP_SETTINGS_DEFAULTS.sourceLimit)
  const candidateMinimum = sourceLimit
  const candidateLimit = clampInteger(parsed.candidateLimit, candidateMinimum, 20, Math.max(BISHOP_SETTINGS_DEFAULTS.candidateLimit, candidateMinimum))
  const historyTurnLimit = clampInteger(parsed.historyTurnLimit, 0, 20, BISHOP_SETTINGS_DEFAULTS.historyTurnLimit)

  return {
    sourceLimit,
    candidateLimit,
    historyTurnLimit,
  }
}

export function useBishopSettings() {
  const [bishopSettings, setBishopSettings] = useState<BishopSettings>(() => readBishopSettings())

  useEffect(() => {
    if (typeof window === 'undefined') return

    window.localStorage.setItem(BISHOP_SETTINGS_STORAGE_KEY, JSON.stringify(bishopSettings, null, 2))
  }, [bishopSettings])

  const setBishopSetting = <K extends keyof BishopSettings>(key: K, value: BishopSettings[K]) => {
    setBishopSettings((current) => {
      const next = { ...current, [key]: value }
      const sourceLimit = clampInteger(next.sourceLimit, 1, 8, BISHOP_SETTINGS_DEFAULTS.sourceLimit)
      const candidateLimit = clampInteger(next.candidateLimit, sourceLimit, 20, Math.max(BISHOP_SETTINGS_DEFAULTS.candidateLimit, sourceLimit))
      const historyTurnLimit = clampInteger(next.historyTurnLimit, 0, 20, BISHOP_SETTINGS_DEFAULTS.historyTurnLimit)

      return {
        sourceLimit,
        candidateLimit,
        historyTurnLimit,
      }
    })
  }

  const clearBishopSettings = () => {
    setBishopSettings(BISHOP_SETTINGS_DEFAULTS)
  }

  return { bishopSettings, setBishopSetting, clearBishopSettings }
}
