import { useEffect, useState } from 'react'
import { isRecord, parseStoredJsonOrNull } from '../lib/storage-schema'

export const WORKER_SETTINGS_STORAGE_KEY = 'deepvault_worker_settings'
export const WORKER_TOKEN_STORAGE_KEY = 'deepvault_worker_token'

export type WorkerMode = 'local' | 'remote'
export type WorkerFallbackMode = 'read_only' | 'block' | 'none'

export interface WorkerSettings {
  workerMode: WorkerMode
  workerUrl: string
  workerToken: string
  workerTimeoutSeconds: number
  workerFallbackMode: WorkerFallbackMode
  analyzeLimit: number
}

export const WORKER_SETTINGS_DEFAULTS: WorkerSettings = {
  workerMode: import.meta.env.VITE_WORKER_MODE === 'remote' ? 'remote' : 'local',
  workerUrl: import.meta.env.VITE_WORKER_URL?.trim() || '',
  workerToken: '',
  workerTimeoutSeconds: 30,
  workerFallbackMode: 'read_only',
  analyzeLimit: 12,
}

function readWorkerSettings(): WorkerSettings {
  if (typeof window === 'undefined') return WORKER_SETTINGS_DEFAULTS

  const raw = window.localStorage.getItem(WORKER_SETTINGS_STORAGE_KEY)
  const tokenRaw = window.sessionStorage.getItem(WORKER_TOKEN_STORAGE_KEY)
  if (!raw) return WORKER_SETTINGS_DEFAULTS

  const parsed = parseStoredJsonOrNull(raw, {
    storageKey: WORKER_SETTINGS_STORAGE_KEY,
    validate: (value) => {
      if (!isRecord(value)) {
        return null
      }

      return {
        workerMode: value.workerMode,
        workerUrl: typeof value.workerUrl === 'string' ? value.workerUrl : undefined,
        workerToken: typeof value.workerToken === 'string' ? value.workerToken : undefined,
        workerTimeoutSeconds: typeof value.workerTimeoutSeconds === 'number' ? value.workerTimeoutSeconds : undefined,
        workerFallbackMode: value.workerFallbackMode,
        analyzeLimit: typeof value.analyzeLimit === 'number' ? value.analyzeLimit : undefined,
      }
    },
  })
  if (!parsed) {
    return WORKER_SETTINGS_DEFAULTS
  }

  const tokenParsed: Partial<Pick<WorkerSettings, 'workerToken'>> = parseStoredJsonOrNull(tokenRaw, {
    storageKey: WORKER_TOKEN_STORAGE_KEY,
    storageName: 'sessionStorage',
    validate: (value) => {
      if (!isRecord(value)) {
        return null
      }

      return {
        workerToken: typeof value.workerToken === 'string' ? value.workerToken : undefined,
      }
    },
  }) ?? {}
  const legacyToken = parsed.workerToken?.trim() || ''
  const workerToken = tokenParsed.workerToken?.trim() || legacyToken
  const mode = parsed.workerMode === 'remote' ? 'remote' : 'local'
  const fallback: WorkerFallbackMode =
    parsed.workerFallbackMode === 'block' || parsed.workerFallbackMode === 'none'
      ? parsed.workerFallbackMode
      : 'read_only'
  const timeout = typeof parsed.workerTimeoutSeconds === 'number' && parsed.workerTimeoutSeconds > 0
    ? parsed.workerTimeoutSeconds
    : WORKER_SETTINGS_DEFAULTS.workerTimeoutSeconds
  const analyzeLimit = typeof parsed.analyzeLimit === 'number' && parsed.analyzeLimit > 0
    ? Math.round(parsed.analyzeLimit)
    : WORKER_SETTINGS_DEFAULTS.analyzeLimit
  return {
    workerMode: mode,
    workerUrl: parsed.workerUrl?.trim() || '',
    workerToken,
    workerTimeoutSeconds: timeout,
    workerFallbackMode: fallback,
    analyzeLimit,
  }
}

export function useWorkerSettings() {
  const [workerSettings, setWorkerSettings] = useState<WorkerSettings>(() => readWorkerSettings())

  useEffect(() => {
    if (typeof window === 'undefined') return

    const { workerToken, ...rest } = workerSettings
    window.localStorage.setItem(WORKER_SETTINGS_STORAGE_KEY, JSON.stringify(rest, null, 2))
    window.sessionStorage.setItem(WORKER_TOKEN_STORAGE_KEY, JSON.stringify({ workerToken }, null, 2))
  }, [workerSettings])

  const setWorkerSetting = <K extends keyof WorkerSettings>(key: K, value: WorkerSettings[K]) => {
    setWorkerSettings((current) => ({ ...current, [key]: value }))
  }

  const clearWorkerSettings = () => {
    setWorkerSettings(WORKER_SETTINGS_DEFAULTS)
  }

  return { workerSettings, setWorkerSetting, clearWorkerSettings }
}
