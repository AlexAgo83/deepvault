import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createWorkerClient, type WorkerEventStream } from '../lib/worker-client'
import type { WorkerSettings } from './useWorkerSettings'
import { WORKER_SETTINGS_DEFAULTS } from './useWorkerSettings'

export type SyncOperationKind = 'refresh' | 'ingest' | 'analyze' | 'evaluate' | 'export-live' | 'export-live-resume'
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
  launchedBy?: string
  client?: string
  effectiveConfig?: {
    workerMode: string
    workerUrl: string
    workerFallbackMode: string
    workerTimeoutSeconds: number
    dataMode: string
  }
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
  workerSettings?: WorkerSettings
}

const JOB_HISTORY_LIMIT = 5

// Refresh is simulated: calls onRefreshCorpus() in-app, fake timer steps for UX feedback.
const REFRESH_DEF = {
  command: 'refresh',
  label: 'Refresh',
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
    label: 'Ingest',
    summary: 'Wrote a new local sync snapshot.',
    estimatedLines: 5,
  },
  analyze: {
    command: 'npm run analyze',
    label: 'Analyze',
    summary: 'Wrote additive analysis blocks to the derived corpus artifact.',
    estimatedLines: 25,
  },
  evaluate: {
    command: 'npm run evaluate',
    label: 'Evaluate',
    summary: 'Generated the baseline evaluation report.',
    estimatedLines: 40,
  },
  'export-live': {
    command: 'npm run export:live',
    label: 'Start Sync',
    summary: 'Completed the live sync from SharePoint.',
    estimatedLines: 50,
  },
  'export-live-resume': {
    command: 'npm run export:live -- --resume',
    label: 'Resume Sync',
    summary: 'Resumed live sync from last checkpoint.',
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

function trimJobLines(lines: SyncConsoleLine[]): SyncConsoleLine[] {
  return lines.slice(-MAX_JOB_LINES)
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }
  return ''
}

function buildWorkerStartupFailureSummary(error: unknown, workerSettings: WorkerSettings): string {
  const message = extractErrorMessage(error)

  if (!message) {
    return workerSettings.workerFallbackMode === 'read_only'
      ? 'Could not reach the worker. Staying on the published corpus in read-only mode.'
      : 'Could not reach the worker. Make sure you are running the Vite dev server.'
  }

  if (/aborterror|failed to fetch|networkerror|could not reach the worker|offline/i.test(message)) {
    return workerSettings.workerFallbackMode === 'read_only'
      ? 'Could not reach the worker. Staying on the published corpus in read-only mode.'
      : 'Could not reach the worker. Make sure you are running the Vite dev server.'
  }

  return message
}

function formatCommandLine(
  command: string,
  context: Pick<
    UseSyncOperationsOptions,
    'activeScopeLabel' | 'provider' | 'role' | 'visibleDocs' | 'syncedSites' | 'restrictedSites' | 'refreshPolicy'
  >,
  workerSettings: WorkerSettings,
): string {
  return [
    `$ ${command}`,
    `Scope: ${context.activeScopeLabel}`,
    `Role: ${context.role} | Provider: ${context.provider}`,
    `Visible docs: ${context.visibleDocs} | Synced sites: ${context.syncedSites} | Restricted sites: ${context.restrictedSites}`,
    `Refresh policy: ${context.refreshPolicy}`,
    `Worker mode: ${workerSettings.workerMode} | Fallback: ${workerSettings.workerFallbackMode}`,
  ].join('\n')
}

const ACTIVE_JOB_SESSION_KEY = 'deepvault_active_job'
const JOB_HISTORY_STORAGE_KEY = 'deepvault_sync_job_history'
const MAX_JOB_LINES = 20

type LiveOpKind = 'ingest' | 'analyze' | 'evaluate' | 'export-live' | 'export-live-resume'

interface PersistedActiveJob {
  serverJobId: string
  jobId: string
  kind: LiveOpKind
  startedAt: string
}

function buildOperationEnv(kind: LiveOpKind, extraEnv: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}

  if (extraEnv.DEEPVAULT_DATA_MODE) {
    env.DEEPVAULT_DATA_MODE = extraEnv.DEEPVAULT_DATA_MODE
  }

  if (kind === 'evaluate' || kind === 'analyze') {
    if (extraEnv.OPENAI_API_KEY) env.OPENAI_API_KEY = extraEnv.OPENAI_API_KEY
    if (extraEnv.GEMINI_API_KEY) env.GEMINI_API_KEY = extraEnv.GEMINI_API_KEY
    if (extraEnv.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = extraEnv.ANTHROPIC_API_KEY
  }

  if (kind === 'export-live' || kind === 'export-live-resume') {
    if (extraEnv.DEEPVAULT_ENTRA_APP_ID) env.DEEPVAULT_ENTRA_APP_ID = extraEnv.DEEPVAULT_ENTRA_APP_ID
    if (extraEnv.DEEPVAULT_ENTRA_TENANT_ID) env.DEEPVAULT_ENTRA_TENANT_ID = extraEnv.DEEPVAULT_ENTRA_TENANT_ID
    if (extraEnv.DEEPVAULT_ENTRA_SECRET_VALUE) env.DEEPVAULT_ENTRA_SECRET_VALUE = extraEnv.DEEPVAULT_ENTRA_SECRET_VALUE
    if (extraEnv.DEEPVAULT_ENTRA_SITES) env.DEEPVAULT_ENTRA_SITES = extraEnv.DEEPVAULT_ENTRA_SITES
    if (extraEnv.DEEPVAULT_PILOT_SITE_NAMES) env.DEEPVAULT_PILOT_SITE_NAMES = extraEnv.DEEPVAULT_PILOT_SITE_NAMES
  }

  return env
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

function persistJobHistory(history: SyncOperationJob[]) {
  const trimmedHistory = history.map((job) => ({
    ...job,
    lines: trimJobLines(job.lines || []),
  }))
  localStorage.setItem(JOB_HISTORY_STORAGE_KEY, JSON.stringify(trimmedHistory, null, 2))
}

function readPersistedJobHistory(): SyncOperationJob[] {
  try {
    const raw = localStorage.getItem(JOB_HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is SyncOperationJob => Boolean(item && typeof item === 'object' && 'id' in item && 'status' in item))
      .map((job) => ({
        ...job,
        lines: trimJobLines(job.lines || []),
      }))
  } catch {
    return []
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
  workerSettings = WORKER_SETTINGS_DEFAULTS,
}: UseSyncOperationsOptions) {
  const workerClient = useMemo(() => createWorkerClient({
    ...workerSettings,
    dataMode: extraEnv.DEEPVAULT_DATA_MODE || 'mock',
  }), [workerSettings, extraEnv.DEEPVAULT_DATA_MODE])
  const [activeJob, setActiveJob] = useState<SyncOperationJob | null>(null)
  const [jobHistory, setJobHistory] = useState<SyncOperationJob[]>(() => readPersistedJobHistory())
  const timersRef = useRef<number[]>([])
  const activeJobRef = useRef<SyncOperationJob | null>(null)
  const eventSourceRef = useRef<WorkerEventStream | null>(null)
  const serverJobIdRef = useRef<string | null>(null)
  const watchdogTimerRef = useRef<number | null>(null)

  useEffect(() => {
    activeJobRef.current = activeJob
  }, [activeJob])

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer)
    }
    timersRef.current = []
  }, [])

  const clearWatchdog = useCallback(() => {
    if (watchdogTimerRef.current !== null) {
      window.clearTimeout(watchdogTimerRef.current)
      watchdogTimerRef.current = null
    }
  }, [])

  const closeActiveStream = useCallback(() => {
    clearWatchdog()
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    serverJobIdRef.current = null
  }, [clearWatchdog])

  useEffect(() => () => {
    clearTimers()
    closeActiveStream()
  }, [clearTimers, closeActiveStream])

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
      launchedBy: 'deepvault-app-shell',
      client: 'deepvault-app-shell',
      effectiveConfig: {
        workerMode: workerSettings.workerMode,
        workerUrl: workerSettings.workerUrl,
        workerFallbackMode: workerSettings.workerFallbackMode,
        workerTimeoutSeconds: workerSettings.workerTimeoutSeconds,
        dataMode: extraEnv.DEEPVAULT_DATA_MODE || 'mock',
      },
    }

    setActiveJob(job)
    serverJobIdRef.current = persisted.serverJobId

    let lineCount = 0
    const es = workerClient.openJobEvents(persisted.serverJobId)
    eventSourceRef.current = es
    const closeStream = () => closeActiveStream()
    attachJobWatchdog(persisted.jobId, persisted.serverJobId, def.label, def.summary, closeStream)

    es.onmessage = (event: MessageEvent<string>) => {
      attachJobWatchdog(persisted.jobId, persisted.serverJobId, def.label, def.summary, closeStream)
      const data = JSON.parse(event.data) as { type: string; text?: string; isError?: boolean; exitCode?: number }
      if (data.type === 'line' && data.text) {
        lineCount++
        const progress = Math.min(95, Math.round((lineCount / def.estimatedLines) * 100))
        patchActiveJob(persisted.jobId, (current) => ({
          ...current,
          progress,
          lines: trimJobLines([...current.lines, makeLine(data.text!, detectLineTone(data.text!, data.isError ?? false))]),
        }))
      } else if (data.type === 'done') {
        const success = data.exitCode === 0
        clearPersistedJob()
        finalizeJob(persisted.jobId, success ? 'completed' : 'failed', success ? def.summary : `${def.label} failed.`)
        closeStream()
      }
    }

    es.onerror = () => {
      clearPersistedJob()
      finalizeJob(persisted.jobId, 'failed', `Could not reconnect to ${def.label}.`)
      closeStream()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only reconnect effect
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
        lines: trimJobLines([
          ...current.lines,
          makeLine(
            status === 'completed'
              ? summary
              : status === 'cancelled'
                ? 'Operation cancelled.'
                : 'Operation failed.',
            status === 'completed' ? 'success' : 'danger',
          ),
        ]),
      }

    setActiveJob(finalized)
    setJobHistory((currentHistory) => {
      const nextHistory = [finalized, ...currentHistory.filter((job) => job.id !== jobId)].slice(0, JOB_HISTORY_LIMIT)
      persistJobHistory(nextHistory)
      return nextHistory
    })
  },
  [],
  )

  const finalizeLiveWorkerJob = useCallback(async (
    jobId: string,
    serverJobId: string,
    def: typeof LIVE_OP_DEFS[LiveOpKind],
    exitCode?: number,
  ) => {
    const success = exitCode === 0
    if (success) {
      clearPersistedJob()
      finalizeJob(jobId, 'completed', def.summary)
      return
    }

    let failureSummary = `${def.label} failed.`
    try {
      const state = await workerClient.getJob(serverJobId)
      if (state.notes?.trim()) {
        failureSummary = state.notes.trim()
      }
    } catch {
      // Keep the generic fallback when the job state cannot be fetched.
    }

    clearPersistedJob()
    finalizeJob(jobId, 'failed', failureSummary)
  }, [finalizeJob, workerClient])

  const attachJobWatchdog = useCallback((
    jobId: string,
    serverJobId: string,
    label: string,
    successSummary: string,
    closeStream: () => void,
  ) => {
    clearWatchdog()
    watchdogTimerRef.current = window.setTimeout(async () => {
      try {
        const state = await workerClient.getJob(serverJobId)
        if (state.status === 'completed' || state.status === 'failed' || state.status === 'cancelled') {
          clearPersistedJob()
          finalizeJob(
            jobId,
            state.status === 'completed' ? 'completed' : state.status === 'cancelled' ? 'cancelled' : 'failed',
            state.status === 'completed' ? successSummary : state.notes?.trim() || `${label} failed.`,
          )
          closeStream()
          return
        }
      } catch {
        clearPersistedJob()
        finalizeJob(jobId, 'failed', `Lost contact with ${label}.`)
        closeStream()
        return
      }

      attachJobWatchdog(jobId, serverJobId, label, successSummary, closeStream)
    }, workerSettings.workerTimeoutSeconds * 1000)
  }, [clearWatchdog, finalizeJob, workerClient, workerSettings.workerTimeoutSeconds])

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
      summary: 'Refresh started.',
      lines: [makeLine(formatCommandLine(REFRESH_DEF.command, {
        activeScopeLabel,
        provider,
        role,
        visibleDocs,
        syncedSites,
        restrictedSites,
        refreshPolicy,
      }, workerSettings), 'muted')],
      launchedBy: 'deepvault-app-shell',
      client: 'deepvault-app-shell',
      effectiveConfig: {
        workerMode: workerSettings.workerMode,
        workerUrl: workerSettings.workerUrl,
        workerFallbackMode: workerSettings.workerFallbackMode,
        workerTimeoutSeconds: workerSettings.workerTimeoutSeconds,
        dataMode: extraEnv.DEEPVAULT_DATA_MODE || 'mock',
      },
    }

    setActiveJob(job)
    void Promise.resolve(onRefreshCorpus())

      REFRESH_DEF.steps.forEach((step) => {
        pushTimer(() => {
          patchActiveJob(jobId, (current) => ({
            ...current,
            progress: step.progress,
            lines: trimJobLines([...current.lines, makeLine(step.text, step.tone)]),
          }))
        }, step.delayMs)
      })

    const totalDelay = Math.max(...REFRESH_DEF.steps.map((step) => step.delayMs))
    pushTimer(() => finalizeJob(jobId, 'completed', REFRESH_DEF.summary), totalDelay + 90)
  }, [activeScopeLabel, clearTimers, extraEnv.DEEPVAULT_DATA_MODE, finalizeJob, onRefreshCorpus, patchActiveJob, provider, refreshPolicy, restrictedSites, role, syncedSites, visibleDocs, pushTimer, workerSettings])

  // Live operation — ingest, analyze, evaluate, export-live, and export-live-resume via the worker client.
  const runLiveOperation = useCallback((kind: LiveOpKind) => {
    if (activeJobRef.current?.status === 'running') {
      return
    }

    clearTimers()
    closeActiveStream()

    const def = LIVE_OP_DEFS[kind]
    const operationEnv = buildOperationEnv(kind, extraEnv)
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
      lines: [makeLine(formatCommandLine(def.command, {
        activeScopeLabel,
        provider,
        role,
        visibleDocs,
        syncedSites,
        restrictedSites,
        refreshPolicy,
      }, workerSettings), 'muted')],
      launchedBy: role,
      client: 'deepvault-app-shell',
      effectiveConfig: {
        workerMode: workerSettings.workerMode,
        workerUrl: workerSettings.workerUrl,
        workerFallbackMode: workerSettings.workerFallbackMode,
        workerTimeoutSeconds: workerSettings.workerTimeoutSeconds,
        dataMode: extraEnv.DEEPVAULT_DATA_MODE || 'mock',
      },
    }

    setActiveJob(job)

    async function start() {
      let serverJobId: string
      try {
        const result = await workerClient.startJob({
          kind,
          env: operationEnv,
          launchedBy: role,
          client: 'deepvault-app-shell',
          effectiveConfig: {
            workerMode: workerSettings.workerMode,
            workerUrl: workerSettings.workerUrl,
            workerFallbackMode: workerSettings.workerFallbackMode,
            workerTimeoutSeconds: workerSettings.workerTimeoutSeconds,
            dataMode: extraEnv.DEEPVAULT_DATA_MODE || 'mock',
          },
        })
        serverJobId = result.jobId
      } catch (error) {
        finalizeJob(
          jobId,
          'failed',
          buildWorkerStartupFailureSummary(error, workerSettings),
        )
        return
      }

      serverJobIdRef.current = serverJobId
      persistActiveJob({ serverJobId, jobId, kind, startedAt: job.startedAt })

      let lineCount = 0
      const es = workerClient.openJobEvents(serverJobId)
      eventSourceRef.current = es
      const closeStream = () => closeActiveStream()
      attachJobWatchdog(jobId, serverJobId, def.label, def.summary, closeStream)

      es.onmessage = (event: MessageEvent<string>) => {
        attachJobWatchdog(jobId, serverJobId, def.label, def.summary, closeStream)
        const data = JSON.parse(event.data) as { type: string; text?: string; isError?: boolean; exitCode?: number }

        if (data.type === 'line' && data.text) {
          lineCount++
          const progress = Math.min(95, Math.round((lineCount / def.estimatedLines) * 100))
          const tone = detectLineTone(data.text, data.isError ?? false)
          patchActiveJob(jobId, (current) => ({
            ...current,
            progress,
            lines: trimJobLines([...current.lines, makeLine(data.text!, tone)]),
          }))
        } else if (data.type === 'done') {
          void finalizeLiveWorkerJob(jobId, serverJobId, def, data.exitCode)
            .finally(() => {
              closeStream()
            })
        }
      }

      es.onerror = () => {
        clearPersistedJob()
        finalizeJob(jobId, 'failed', `${def.label} failed.`)
        closeStream()
      }
    }

    void start()
  }, [activeScopeLabel, attachJobWatchdog, clearTimers, closeActiveStream, extraEnv, finalizeJob, finalizeLiveWorkerJob, patchActiveJob, provider, refreshPolicy, restrictedSites, role, syncedSites, visibleDocs, workerClient, workerSettings])

  const cancelActiveJob = useCallback(() => {
    const current = activeJobRef.current
    if (!current || current.status !== 'running') {
      return
    }
    const serverJobId = serverJobIdRef.current

    clearTimers()
    closeActiveStream()

    if (serverJobId) {
      void workerClient.cancelJob(serverJobId)
    }
    clearPersistedJob()

    finalizeJob(current.id, 'cancelled', `${current.label} cancelled.`)
  }, [clearTimers, closeActiveStream, finalizeJob, workerClient])

  const startRefresh = useCallback(() => runRefresh(), [runRefresh])
  const startIngest = useCallback(() => runLiveOperation('ingest'), [runLiveOperation])
  const startAnalyze = useCallback(() => runLiveOperation('analyze'), [runLiveOperation])
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
    startAnalyze,
    startEvaluate,
    startExportLive,
    startExportLiveResume,
    startIngest,
    startRefresh,
  }
}
