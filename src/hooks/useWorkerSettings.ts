import { useEffect, useState } from 'react'

export const WORKER_SETTINGS_STORAGE_KEY = 'deepvault_worker_settings'

export type WorkerMode = 'local' | 'remote'
export type WorkerFallbackMode = 'read_only' | 'block' | 'none'

export interface WorkerSettings {
  workerMode: WorkerMode
  workerUrl: string
  workerToken: string
  workerTimeoutSeconds: number
  workerFallbackMode: WorkerFallbackMode
}

export const WORKER_SETTINGS_DEFAULTS: WorkerSettings = {
  workerMode: 'local',
  workerUrl: '',
  workerToken: '',
  workerTimeoutSeconds: 30,
  workerFallbackMode: 'read_only',
}

function readWorkerSettings(): WorkerSettings {
  if (typeof window === 'undefined') return WORKER_SETTINGS_DEFAULTS

  const raw = window.localStorage.getItem(WORKER_SETTINGS_STORAGE_KEY)
  if (!raw) return WORKER_SETTINGS_DEFAULTS

  try {
    const parsed = JSON.parse(raw) as Partial<WorkerSettings>
    const mode = parsed.workerMode === 'remote' ? 'remote' : 'local'
    const fallback: WorkerFallbackMode =
      parsed.workerFallbackMode === 'block' || parsed.workerFallbackMode === 'none'
        ? parsed.workerFallbackMode
        : 'read_only'
    const timeout = typeof parsed.workerTimeoutSeconds === 'number' && parsed.workerTimeoutSeconds > 0
      ? parsed.workerTimeoutSeconds
      : WORKER_SETTINGS_DEFAULTS.workerTimeoutSeconds
    return {
      workerMode: mode,
      workerUrl: parsed.workerUrl?.trim() || '',
      workerToken: parsed.workerToken?.trim() || '',
      workerTimeoutSeconds: timeout,
      workerFallbackMode: fallback,
    }
  } catch {
    return WORKER_SETTINGS_DEFAULTS
  }
}

export function useWorkerSettings() {
  const [workerSettings, setWorkerSettings] = useState<WorkerSettings>(() => readWorkerSettings())

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(WORKER_SETTINGS_STORAGE_KEY, JSON.stringify(workerSettings, null, 2))
  }, [workerSettings])

  const setWorkerSetting = <K extends keyof WorkerSettings>(key: K, value: WorkerSettings[K]) => {
    setWorkerSettings((current) => ({ ...current, [key]: value }))
  }

  const clearWorkerSettings = () => {
    setWorkerSettings(WORKER_SETTINGS_DEFAULTS)
  }

  return { workerSettings, setWorkerSetting, clearWorkerSettings }
}
