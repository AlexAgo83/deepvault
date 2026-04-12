import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type SyncOperationKind = 'refresh' | 'ingest' | 'evaluate' | 'export-live' | 'export-live-resume'
export type SyncOperationStatus = 'running' | 'completed' | 'failed' | 'cancelled'
export type SyncConsoleTone = 'muted' | 'normal' | 'success' | 'danger'

export interface SyncConsoleLine {
  id: string
  timestamp: string
  text: string
  tone: SyncConsoleTone
}

export interface SyncOperationJob {
  id: string
  kind: SyncOperationKind
  label: string
  command: string
  status: SyncOperationStatus
  progress: number
  startedAt: string
  finishedAt?: string
  durationMs?: number
  summary: string
  lines: SyncConsoleLine[]
}

export interface UseSyncOperationsOptions {
  activeScopeLabel: string
  extraEnv: Record<string, string>
  provider: string
  role: string
  visibleDocs: number
  syncedSites: number
  restrictedSites: number
  refreshPolicy: string
  onRefreshCorpus: () => void | Promise<void>
}

const JOB_HISTORY_LIMIT = 5

// Refresh is simulated: calls onRefreshCorpus() in-app, fake timer steps for UX feedback.
const REFRESH_DEF = {
  command: 'refresh status',
  label: 'Refresh status',
  summary: 'Refreshed the current corpus snapshot.',
  steps: [
    { delayMs: 140, progress: 12, text: 'Refreshing the current corpus snapshot...', tone: 'muted' as SyncConsoleTone },
    { delayMs: 420, progress: 32, text: 'Reading the latest live corpus state and scope filters...', tone: 'muted' as SyncConsoleTone },
    { delayMs: 860, progress: 68, text: 'Updating site coverage, freshness, and readiness signals...', tone: 'normal' as SyncConsoleTone },
    { delayMs: 1320, progress: 100, text: 'Refresh completed successfully.', tone: 'success' as SyncConsoleTone },
  ],
}

// Ingest, evaluate, and export-live run real scripts via the ops-server Vite plugin.
const LIVE_OP_DEFS = {
  ingest: {
    command: 'npm run ingest',
    label: 'Run ingest',
    summary: 'Wrote a new local sync snapshot.',
    estimatedLines: 5,
  },
  evaluate: {
    command: 'npm run evaluate',
    label: 'Run evaluate',
    summary: 'Generated the baseline evaluation report.',
    estimatedLines: 40,
  },
  'export-live': {
    command: 'npm run export:live',
    label: 'Run live export',
    summary: 'Exported live corpus from SharePoint.',
    estimatedLines: 50,
  },
  'export-live-resume': {
    command: 'npm run export:live -- --resume',
    label: 'Resume live export',
    summary: 'Resumed live export from last checkpoint.',
    estimatedLines: 50,
  },
} as const

function makeLine(text: string, tone: SyncConsoleTone = 'normal'): SyncConsoleLine {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    text,
    tone,
  }
}

function formatCommandLine(
  command: string,
  context: Pick<UseSyncOperationsOptions, 'activeScopeLabel' | 'provider' | 'role' | 'visibleDocs' | 'syncedSites' | 'restrictedSites' | 'refreshPolicy'>,
): string {
  return [
    `$ ${command}`,
    `Scope: ${context.activeScopeLabel}`,
    `Role: ${context.role} | Provider: ${context.provider}`,
    `Visible docs: ${context.visibleDocs} | Synced sites: ${context.syncedSites} | Restricted sites: ${context.restrictedSites}`,
    `Refresh policy: ${context.refreshPolicy}`,
  ].join('\n')
}

const ACTIVE_JOB_SESSION_KEY = 'deepvault_active_job'

type LiveOpKind = 'ingest' | 'evaluate' | 'export-live' | 'export-live-resume'

interface PersistedActiveJob {
  serverJobId: string
  jobId: string
  kind: LiveOpKind
  startedAt: string
}

function persistActiveJob(data: PersistedActiveJob) {
  sessionStorage.setItem(ACTIVE_JOB_SESSION_KEY, JSON.stringify(data))
}

function clearPersistedJob() {
  sessionStorage.removeItem(ACTIVE_JOB_SESSION_KEY)
}

function readPersistedJob(): PersistedActiveJob | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_JOB_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedActiveJob
    if (!parsed.serverJobId || !parsed.jobId || !parsed.kind || !parsed.startedAt) return null
    if (!(parsed.kind in LIVE_OP_DEFS)) return null
    return parsed
  } catch {
    return null
  }
}

function detectLineTone(text: string, isError: boolean): SyncConsoleTone {
  if (isError) return 'danger'
  if (/error|fail/i.test(text)) return 'danger'
  if (/success|finished|completed|wrote/i.test(text)) return 'success'
  return 'normal'
}

export function useSyncOperations({
  activeScopeLabel,
  extraEnv,
  provider,
  role,
  visibleDocs,
  syncedSites,
  restrictedSites,
  refreshPolicy,
  onRefreshCorpus,
}: UseSyncOperationsOptions) {
  const [activeJob, setActiveJob] = useState<SyncOperationJob | null>(null)
  const [jobHistory, setJobHistory] = useState<SyncOperationJob[]>([])
  const timersRef = useRef<number[]>([])
  const activeJobRef = useRef<SyncOperationJob | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const serverJobIdRef = useRef<string | null>(null)

  useEffect(() => {
    activeJobRef.current = activeJob
  }, [activeJob])

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer)
    }
    timersRef.current = []
  }, [])

  useEffect(() => () => {
    clearTimers()
    eventSourceRef.current?.close()
  }, [clearTimers])

  // On mount: reconnect to a process that was running before a page reload
  useEffect(() => {
    const persisted = readPersistedJob()
    if (!persisted) return

    const def = LIVE_OP_DEFS[persisted.kind]

    const job: SyncOperationJob = {
      id: persisted.jobId,
      kind: persisted.kind,
      label: def.label,
      command: def.command,
      status: 'running',
      progress: 0,
      startedAt: persisted.startedAt,
      summary: `${def.label} running.`,
      lines: [makeLine('Reconnecting to running process…', 'muted')],
    }

    setActiveJob(job)
    serverJobIdRef.current = persisted.serverJobId

    let lineCount = 0
    const es = new EventSource(`/api/ops/stream/${persisted.serverJobId}`)
    eventSourceRef.current = es

    es.onmessage = (event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as { type: string; text?: string; isError?: boolean; exitCode?: number }
      if (data.type === 'line' && data.text) {
        lineCount++
        const progress = Math.min(95, Math.round((lineCount / def.estimatedLines) * 100))
        patchActiveJob(persisted.jobId, (current) => ({
          ...current,
          progress,
          lines: [...current.lines, makeLine(data.text!, detectLineTone(data.text!, data.isError ?? false))],
        }))
      } else if (data.type === 'done') {
        const success = data.exitCode === 0
        clearPersistedJob()
        finalizeJob(persisted.jobId, success ? 'completed' : 'failed', success ? def.summary : `${def.label} failed.`)
        es.close()
        eventSourceRef.current = null
        serverJobIdRef.current = null
      }
    }

    es.onerror = () => {
      clearPersistedJob()
      finalizeJob(persisted.jobId, 'failed', `Could not reconnect to ${def.label}.`)
      es.close()
      eventSourceRef.current = null
      serverJobIdRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally runs once on mount only

  const pushTimer = useCallback((callback: () => void, delayMs: number) => {
    const timer = window.setTimeout(callback, delayMs)
    timersRef.current.push(timer)
    return timer
  }, [])

  const patchActiveJob = useCallback((jobId: string, patch: (_current: SyncOperationJob) => SyncOperationJob) => {
    setActiveJob((current) => {
      if (!current || current.id !== jobId) {
        return current
      }
      return patch(current)
    })
  }, [])

  const finalizeJob = useCallback(
    (jobId: string, status: SyncOperationStatus, summary: string) => {
      const current = activeJobRef.current
      if (!current || current.id !== jobId) {
        return
      }

      const finalized = {
        ...current,
        status,
        progress: status === 'completed' ? 100 : current.progress,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(current.startedAt).getTime(),
        summary,
        lines: [
          ...current.lines,
          makeLine(
            status === 'completed'
              ? summary
              : status === 'cancelled'
                ? 'Operation cancelled.'
                : 'Operation failed.',
            status === 'completed' ? 'success' : 'danger',
          ),
        ],
      }

      setActiveJob(finalized)
      setJobHistory((currentHistory) => [finalized, ...currentHistory].slice(0, JOB_HISTORY_LIMIT))
    },
    [],
  )

  // Simulated operation — refresh only (drives onRefreshCorpus, fake timer UX).
  const runRefresh = useCallback(() => {
    if (activeJobRef.current?.status === 'running') {
      return
    }

    clearTimers()
    const jobId = `refresh-${Date.now()}`
    const startedAt = new Date().toISOString()

    const job: SyncOperationJob = {
      id: jobId,
      kind: 'refresh',
      label: REFRESH_DEF.label,
      command: REFRESH_DEF.command,
      status: 'running',
      progress: 0,
      startedAt,
      summary: 'Refresh status started.',
      lines: [makeLine(formatCommandLine(REFRESH_DEF.command, { activeScopeLabel, provider, role, visibleDocs, syncedSites, restrictedSites, refreshPolicy }), 'muted')],
    }

    setActiveJob(job)
    void Promise.resolve(onRefreshCorpus())

    REFRESH_DEF.steps.forEach((step) => {
      pushTimer(() => {
        patchActiveJob(jobId, (current) => ({
          ...current,
          progress: step.progress,
          lines: [...current.lines, makeLine(step.text, step.tone)],
        }))
      }, step.delayMs)
    })

    const totalDelay = Math.max(...REFRESH_DEF.steps.map((step) => step.delayMs))
    pushTimer(() => finalizeJob(jobId, 'completed', REFRESH_DEF.summary), totalDelay + 90)
  }, [activeScopeLabel, clearTimers, finalizeJob, onRefreshCorpus, patchActiveJob, provider, refreshPolicy, restrictedSites, role, syncedSites, visibleDocs, pushTimer])

  // Live operation — ingest, evaluate, export-live, and export-live-resume spawn real scripts via the ops-server Vite plugin.
  const runLiveOperation = useCallback((kind: 'ingest' | 'evaluate' | 'export-live' | 'export-live-resume') => {
    if (activeJobRef.current?.status === 'running') {
      return
    }

    clearTimers()
    eventSourceRef.current?.close()
    eventSourceRef.current = null

    const def = LIVE_OP_DEFS[kind]
    const jobId = `${kind}-${Date.now()}`
    const startedAt = new Date().toISOString()

    const job: SyncOperationJob = {
      id: jobId,
      kind,
      label: def.label,
      command: def.command,
      status: 'running',
      progress: 0,
      startedAt,
      summary: `${def.label} started.`,
      lines: [makeLine(formatCommandLine(def.command, { activeScopeLabel, provider, role, visibleDocs, syncedSites, restrictedSites, refreshPolicy }), 'muted')],
    }

    setActiveJob(job)

    async function start() {
      let response: Response
      try {
        response = await fetch('/api/ops/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, env: extraEnv }),
        })
      } catch {
        finalizeJob(jobId, 'failed', 'Could not reach the ops server. Make sure you are running the Vite dev server.')
        return
      }

      const { jobId: serverJobId } = await response.json() as { jobId: string }
      serverJobIdRef.current = serverJobId
      persistActiveJob({ serverJobId, jobId, kind, startedAt: job.startedAt })

      let lineCount = 0
      const es = new EventSource(`/api/ops/stream/${serverJobId}`)
      eventSourceRef.current = es

      es.onmessage = (event: MessageEvent<string>) => {
        const data = JSON.parse(event.data) as { type: string; text?: string; isError?: boolean; exitCode?: number }

        if (data.type === 'line' && data.text) {
          lineCount++
          const progress = Math.min(95, Math.round((lineCount / def.estimatedLines) * 100))
          const tone = detectLineTone(data.text, data.isError ?? false)
          patchActiveJob(jobId, (current) => ({
            ...current,
            progress,
            lines: [...current.lines, makeLine(data.text!, tone)],
          }))
        } else if (data.type === 'done') {
          const success = data.exitCode === 0
          clearPersistedJob()
          finalizeJob(jobId, success ? 'completed' : 'failed', success ? def.summary : `${def.label} failed.`)
          es.close()
          eventSourceRef.current = null
          serverJobIdRef.current = null
        }
      }

      es.onerror = () => {
        clearPersistedJob()
        finalizeJob(jobId, 'failed', `${def.label} failed.`)
        es.close()
        eventSourceRef.current = null
        serverJobIdRef.current = null
      }
    }

    void start()
  }, [activeScopeLabel, clearTimers, extraEnv, finalizeJob, patchActiveJob, provider, refreshPolicy, restrictedSites, role, syncedSites, visibleDocs])

  const cancelActiveJob = useCallback(() => {
    const current = activeJobRef.current
    if (!current || current.status !== 'running') {
      return
    }

    clearTimers()
    eventSourceRef.current?.close()
    eventSourceRef.current = null

    if (serverJobIdRef.current) {
      void fetch(`/api/ops/cancel/${serverJobIdRef.current}`, { method: 'POST' })
      serverJobIdRef.current = null
    }
    clearPersistedJob()

    finalizeJob(current.id, 'cancelled', `${current.label} cancelled.`)
  }, [clearTimers, finalizeJob])

  const startRefresh = useCallback(() => runRefresh(), [runRefresh])
  const startIngest = useCallback(() => runLiveOperation('ingest'), [runLiveOperation])
  const startEvaluate = useCallback(() => runLiveOperation('evaluate'), [runLiveOperation])
  const startExportLive = useCallback(() => runLiveOperation('export-live'), [runLiveOperation])
  const startExportLiveResume = useCallback(() => runLiveOperation('export-live-resume'), [runLiveOperation])

  const lastCompletedJob = useMemo(() => {
    if (activeJob?.status === 'completed' || activeJob?.status === 'failed' || activeJob?.status === 'cancelled') {
      return activeJob
    }
    return jobHistory[0] || null
  }, [activeJob, jobHistory])

  return {
    activeJob,
    cancelActiveJob,
    history: jobHistory,
    isRunning: activeJob?.status === 'running',
    lastCompletedJob,
    startEvaluate,
    startExportLive,
    startExportLiveResume,
    startIngest,
    startRefresh,
  }
}
