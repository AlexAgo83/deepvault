import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type SyncOperationKind = 'refresh' | 'ingest' | 'evaluate'
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
  summary: string
  lines: SyncConsoleLine[]
}

export interface UseSyncOperationsOptions {
  activeScopeLabel: string
  provider: string
  role: string
  visibleDocs: number
  syncedSites: number
  restrictedSites: number
  refreshPolicy: string
  onRefreshCorpus: () => void | Promise<void>
}

const JOB_HISTORY_LIMIT = 5

const JOB_DEFINITIONS: Record<
  SyncOperationKind,
  {
    command: string
    label: string
    summary: string
    steps: Array<{ delayMs: number; progress: number; text: string; tone?: SyncConsoleTone }>
  }
> = {
  refresh: {
    command: 'refresh status',
    label: 'Refresh status',
    summary: 'Refreshed the current corpus snapshot.',
    steps: [
      { delayMs: 140, progress: 12, text: 'Refreshing the current corpus snapshot...', tone: 'muted' },
      { delayMs: 420, progress: 32, text: 'Reading the latest live corpus state and scope filters...', tone: 'muted' },
      { delayMs: 860, progress: 68, text: 'Updating site coverage, freshness, and readiness signals...', tone: 'normal' },
      { delayMs: 1320, progress: 100, text: 'Refresh completed successfully.', tone: 'success' },
    ],
  },
  ingest: {
    command: 'npm run ingest',
    label: 'Run ingest',
    summary: 'Wrote a new local sync snapshot.',
    steps: [
      { delayMs: 140, progress: 10, text: 'Starting local ingestion pipeline...', tone: 'muted' },
      { delayMs: 420, progress: 28, text: 'Scanning pilot sites and permission-aware documents...', tone: 'muted' },
      { delayMs: 860, progress: 56, text: 'Writing chunks and refresh metadata to the local snapshot...', tone: 'normal' },
      { delayMs: 1320, progress: 82, text: 'Verifying corpus coverage and source indexing...', tone: 'normal' },
      { delayMs: 1780, progress: 100, text: 'Ingest finished successfully.', tone: 'success' },
    ],
  },
  evaluate: {
    command: 'npm run evaluate',
    label: 'Run evaluate',
    summary: 'Generated the baseline evaluation report.',
    steps: [
      { delayMs: 140, progress: 8, text: 'Starting evaluation against the current corpus snapshot...', tone: 'muted' },
      { delayMs: 480, progress: 24, text: 'Loading expected answers and retrieval targets...', tone: 'muted' },
      { delayMs: 900, progress: 48, text: 'Scoring grounded answers and tracking missed coverage...', tone: 'normal' },
      { delayMs: 1360, progress: 76, text: 'Computing pass rate and provider comparisons...', tone: 'normal' },
      { delayMs: 1840, progress: 100, text: 'Evaluation report generated successfully.', tone: 'success' },
    ],
  },
}

function makeLine(text: string, tone: SyncConsoleTone = 'normal'): SyncConsoleLine {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    text,
    tone,
  }
}

function formatCommandLine(command: string, context: Pick<UseSyncOperationsOptions, 'activeScopeLabel' | 'provider' | 'role' | 'visibleDocs' | 'syncedSites' | 'restrictedSites' | 'refreshPolicy'>): string {
  return [
    `$ ${command}`,
    `Scope: ${context.activeScopeLabel}`,
    `Role: ${context.role} | Provider: ${context.provider}`,
    `Visible docs: ${context.visibleDocs} | Synced sites: ${context.syncedSites} | Restricted sites: ${context.restrictedSites}`,
    `Refresh policy: ${context.refreshPolicy}`,
  ].join('\n')
}

export function useSyncOperations({
  activeScopeLabel,
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

  useEffect(() => {
    activeJobRef.current = activeJob
  }, [activeJob])

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer)
    }
    timersRef.current = []
  }, [])

  useEffect(() => () => clearTimers(), [clearTimers])

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

  const runOperation = useCallback(
    (kind: SyncOperationKind) => {
      if (activeJobRef.current?.status === 'running') {
        return
      }

      clearTimers()
      const definition = JOB_DEFINITIONS[kind]
      const jobId = `${kind}-${Date.now()}`
      const startedAt = new Date().toISOString()
      const initialLines = [
        makeLine(formatCommandLine(definition.command, { activeScopeLabel, provider, role, visibleDocs, syncedSites, restrictedSites, refreshPolicy }), 'muted'),
      ]

      const job: SyncOperationJob = {
        id: jobId,
        kind,
        label: definition.label,
        command: definition.command,
        status: 'running',
        progress: 0,
        startedAt,
        summary: `${definition.label} started.`,
        lines: initialLines,
      }

      setActiveJob(job)
      if (kind === 'refresh') {
        void Promise.resolve(onRefreshCorpus())
      }

      definition.steps.forEach((step) => {
        pushTimer(() => {
          patchActiveJob(jobId, (current) => ({
            ...current,
            progress: step.progress,
            lines: [...current.lines, makeLine(step.text, step.tone || 'normal')],
          }))
        }, step.delayMs)
      })

      const totalDelay = Math.max(...definition.steps.map((step) => step.delayMs))
      pushTimer(() => finalizeJob(jobId, 'completed', definition.summary), totalDelay + 90)
    },
    [activeScopeLabel, clearTimers, finalizeJob, onRefreshCorpus, patchActiveJob, provider, refreshPolicy, restrictedSites, role, syncedSites, visibleDocs, pushTimer],
  )

  const cancelActiveJob = useCallback(() => {
    const current = activeJobRef.current
    if (!current || current.status !== 'running') {
      return
    }

    clearTimers()
    finalizeJob(current.id, 'cancelled', `${current.label} cancelled.`)
  }, [clearTimers, finalizeJob])

  const startRefresh = useCallback(() => runOperation('refresh'), [runOperation])
  const startIngest = useCallback(() => runOperation('ingest'), [runOperation])
  const startEvaluate = useCallback(() => runOperation('evaluate'), [runOperation])

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
    startIngest,
    startRefresh,
  }
}
