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

export function useWorkerHealth(workerSettings: WorkerSettings, dataMode?: string): WorkerHealthState {
  const [workerHealth, setWorkerHealth] = useState<WorkerHealthState>(() => buildLocalState())

  useEffect(() => {
    let active = true

    if (workerSettings.workerMode !== 'remote') {
      setWorkerHealth(buildLocalState())
      return () => {
        active = false
      }
    }

    const workerUrl = workerSettings.workerUrl.trim()
    const workerToken = workerSettings.workerToken.trim()
    if (!workerUrl) {
      setWorkerHealth(buildMisconfiguredState('Add an https worker URL to run the startup health check.'))
      return () => {
        active = false
      }
    }
    if (!/^https:\/\//i.test(workerUrl)) {
      setWorkerHealth(buildMisconfiguredState('Remote worker mode requires an https worker URL.'))
      return () => {
        active = false
      }
    }
    if (!workerToken) {
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
      ...workerSettings,
      dataMode,
    })

    void client.checkHealth().then((health) => {
      if (!active) {
        return
      }

      setWorkerHealth({
        status: health.status === 'degraded' ? 'degraded' : 'reachable',
        label: health.status === 'degraded' ? 'Worker degraded' : 'Worker reachable',
        detail: `Worker ${health.workerVersion} responded in ${health.mode} mode at ${health.timestamp}.`,
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
  }, [dataMode, workerSettings])

  return workerHealth
}
