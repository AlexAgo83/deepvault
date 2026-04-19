import { useEffect, useState } from 'react'
import type { PillTone } from '../components/app-ui'
import { createWorkerClient } from '../lib/worker-client'
import type { WorkerSettings } from './useWorkerSettings'

export interface WorkerHealthState {
  status: 'local' | 'checking' | 'reachable' | 'degraded' | 'misconfigured' | 'unreachable'
  label: string
  detail: string
  tone: PillTone
}

function buildLocalState(): WorkerHealthState {
  return {
    status: 'local',
    label: 'Local worker',
    detail: 'Startup health checks are only required when a remote worker is configured.',
    tone: 'neutral',
  }
}

function buildMisconfiguredState(detail: string): WorkerHealthState {
  return {
    status: 'misconfigured',
    label: 'Remote worker misconfigured',
    detail,
    tone: 'accent',
  }
}

function isPermittedLocalHttpRemoteUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' && (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1'
    )
  } catch {
    return false
  }
}

function formatWorkerHealthTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function useWorkerHealth(workerSettings: WorkerSettings, dataMode?: string): WorkerHealthState {
  const [workerHealth, setWorkerHealth] = useState<WorkerHealthState>(() => buildLocalState())
  const {
    workerMode,
    workerUrl,
    workerToken,
    workerFallbackMode,
    workerTimeoutSeconds,
    analyzeLimit,
  } = workerSettings

  useEffect(() => {
    let active = true

    if (workerMode !== 'remote') {
      setWorkerHealth(buildLocalState())
      return () => {
        active = false
      }
    }

    const trimmedWorkerUrl = workerUrl.trim()
    const trimmedWorkerToken = workerToken.trim()
    if (!trimmedWorkerUrl) {
      setWorkerHealth(buildMisconfiguredState('Add an https worker URL to run the startup health check.'))
      return () => {
        active = false
      }
    }
    if (!/^https:\/\//i.test(trimmedWorkerUrl) && !isPermittedLocalHttpRemoteUrl(trimmedWorkerUrl)) {
      setWorkerHealth(buildMisconfiguredState('Remote worker mode requires an https worker URL, or http://localhost for local Docker testing.'))
      return () => {
        active = false
      }
    }
    if (!trimmedWorkerToken) {
      setWorkerHealth(buildMisconfiguredState('Add a worker token to validate remote worker availability at startup.'))
      return () => {
        active = false
      }
    }

    setWorkerHealth({
      status: 'checking',
      label: 'Checking remote worker',
      detail: 'Running a silent startup health check against the configured worker.',
      tone: 'neutral',
    })

    const client = createWorkerClient({
      workerMode,
      workerUrl,
      workerToken,
      workerFallbackMode,
      workerTimeoutSeconds,
      analyzeLimit,
      dataMode,
    })

    void client.checkHealth().then((health) => {
      if (!active) {
        return
      }

      setWorkerHealth({
        status: health.status === 'degraded' ? 'degraded' : 'reachable',
        label: health.status === 'degraded' ? 'Worker degraded' : 'Worker reachable',
        detail: `Worker ${health.workerVersion} responded in ${health.mode} mode at ${formatWorkerHealthTimestamp(health.timestamp)}.`,
        tone: health.status === 'degraded' ? 'accent' : 'success',
      })
    }).catch((error: unknown) => {
      if (!active) {
        return
      }

      setWorkerHealth({
        status: 'unreachable',
        label: 'Worker unreachable',
        detail: error instanceof Error ? error.message : 'The configured remote worker did not respond to the startup health check.',
        tone: 'danger',
      })
    })

    return () => {
      active = false
    }
  }, [analyzeLimit, dataMode, workerFallbackMode, workerMode, workerTimeoutSeconds, workerToken, workerUrl])

  return workerHealth
}
