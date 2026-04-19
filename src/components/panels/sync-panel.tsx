import { useEffect, useRef, useState } from 'react'
import { Pill, SectionHeading } from '../app-ui'
import { ConfirmModal } from '../confirm-modal'
import { formatUpdatedAt } from '../../lib/deepvault'
import type { AppModel } from '../../hooks/useAppModel'
import type { WorkerSettings } from '../../hooks/useWorkerSettings'
import { formatDuration } from './sync-panel-utils'

type OpsKey = 'ingest' | 'analyze' | 'publishAnalysis' | 'evaluate' | 'refresh' | 'exportLive' | 'exportLiveResume'
export type SyncView = 'status' | 'operations' | 'history' | 'config'

const SYNC_VIEW_PARAM = 'sync'

const OPS_CONFIG: Record<OpsKey, {
  label: string
  tooltip: string
  description: string
  warning?: string
  confirmLabel: string
}> = {
  ingest: {
    label: 'Ingest',
    tooltip: 'Write sync snapshot from current corpus',
    description: 'Reads the current corpus and writes a new sync state snapshot to data/runtime/sync-state.json. Fast, local operation — no network calls.',
    confirmLabel: 'Ingest',
  },
  analyze: {
    label: 'Analyze',
    tooltip: 'Post-ingest corpus enrichment with additive analysis blocks',
    description: 'Scans the current corpus, selects bounded candidates, and calls the configured AI provider to enrich each document with summary and classification metadata. Results are written to data/runtime/analyzed-corpus.json.',
    warning: 'This makes API calls to your configured provider (OpenAI, Gemini, or Anthropic) and will consume tokens. Cost depends on corpus size and provider rates. Make sure a valid API key is set in Settings before running.',
    confirmLabel: 'Analyze',
  },
  publishAnalysis: {
    label: 'Publish analysis',
    tooltip: 'Promote the analyzed corpus into the live app snapshot',
    description: 'Publishes data/runtime/analyzed-corpus.json into public/live-corpus.json so the app reads the analyzed snapshot as its live corpus.',
    warning: 'This updates the published live corpus consumed by the app. Run Analyze first if you want fresh analysis results included.',
    confirmLabel: 'Publish analysis',
  },
  evaluate: {
    label: 'Evaluate',
    tooltip: 'Score retrieval quality against expected answers',
    description: 'Runs the evaluation pipeline and scores retrieval quality against a set of expected answers. Writes a baseline report to data/eval/.',
    warning: 'This makes API calls to OpenAI and may incur usage costs.',
    confirmLabel: 'Evaluate',
  },
  refresh: {
    label: 'Refresh',
    tooltip: 'Reload corpus state in the app',
    description: 'Reloads the corpus state in the app and updates site coverage, freshness, and provider readiness signals. No files are written.',
    confirmLabel: 'Refresh',
  },
  exportLive: {
    label: 'Start Sync',
    tooltip: 'Full SharePoint export via Microsoft Graph',
    description: 'Connects to SharePoint via Microsoft Graph and exports the full corpus from all configured sites. The existing checkpoint will be overwritten.',
    warning: 'Full sync — may take several minutes depending on corpus size. Requires Entra credentials configured in Settings.',
    confirmLabel: 'Start Sync',
  },
  exportLiveResume: {
    label: 'Resume Sync',
    tooltip: 'Delta sync from last checkpoint',
    description: 'Resumes from the last checkpoint and only fetches documents modified since the previous export. Faster than a full export and preserves unchanged documents.',
    warning: 'Requires a valid checkpoint on disk. If no checkpoint exists the export will fall back to a full run.',
    confirmLabel: 'Resume Sync',
  },
}

const SYNC_VIEWS: { id: SyncView; label: string; detail: string }[] = [
  { id: 'status', label: 'Status', detail: 'Coverage, freshness, and scope signals' },
  { id: 'operations', label: 'Operations', detail: 'Launch ingest, evaluate, refresh, or sync' },
  { id: 'history', label: 'History', detail: 'Recent runs and evaluation prep' },
  { id: 'config', label: 'Worker', detail: 'Worker mode, fallback, and timeout' },
]

function parseSyncView(hash: string): SyncView {
  const search = hash.startsWith('#') ? hash.slice(1) : hash
  const value = new URLSearchParams(search).get(SYNC_VIEW_PARAM)
  if (value === 'recovery') {
    return 'config'
  }
  if (value === 'operations' || value === 'history' || value === 'config') {
    return value
  }
  return 'status'
}

function serializeSyncView(view: SyncView): string {
  const params = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '')
  params.set(SYNC_VIEW_PARAM, view)
  return `#${params.toString()}`
}

function getJobTone(status: string) {
  if (status === 'completed') return 'success'
  if (status === 'failed' || status === 'cancelled') return 'danger'
  return 'accent'
}

function formatHistoryLog(
  lines: AppModel['syncOperations']['history'][number]['lines'],
  fallbackCommand: string,
  maxLines: number,
): string {
  if (!lines.length) {
    return `$ ${fallbackCommand}`
  }

  return lines
    .slice(-maxLines)
    .map((line) => `${formatUpdatedAt(line.timestamp)}  ${line.text}`)
    .join('\n')
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5.25 7.25A6.12 6.12 0 0 1 10 5.25c2.12 0 4.02 1.08 5.16 2.72" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14.5 5.75v2.9h-2.9M14.75 12.75A6.12 6.12 0 0 1 10 14.75c-2.12 0-4.02-1.08-5.16-2.72" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 14.25v-2.9h2.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function StartSyncIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5.5 6.25h9a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-5.5a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8.25 7.75 12.25 10l-4 2.25v-4.5Z" fill="currentColor" />
      <path d="M6.5 14.75h7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function ResumeSyncIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M6 5.75h7.5a1 1 0 0 1 1 1v1.25" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M14.5 5.75v2.25h-2.25" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 10.25a4.75 4.75 0 1 1-1.1 3.05" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12.25 12.25h2.4v2.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IngestIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5.25 6.25h9.5v7.5h-9.5z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 4.5v6.2M7.75 8.1 10 10.35l2.25-2.25" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 15.25h7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function AnalyzeIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5.5 5.75h9v8.5h-9z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7.25 8.25h5.5M7.25 10.5h5.5M7.25 12.75h3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function PublishAnalysisIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5.25 5.5h9.5v5.25h-9.5z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 15.25V8.5M7.75 13l2.25 2.25L12.25 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EvaluateIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5.25 15.25V11M9.5 15.25V7.5M13.75 15.25V9.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4.5 15.25h11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 6.5h9" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function StatusViewIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5.25 10.5 8 13.25l6.75-6.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function OperationsViewIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5 6.75h10M5 10h10M5 13.25h6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="14.5" cy="13.25" r="1.25" fill="currentColor" />
    </svg>
  )
}

function HistoryViewIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 5.25v4.75l3 1.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.75 6.25H3.75v-2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.1 9.25A6 6 0 1 1 6 13.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function WorkerViewIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="4.5" y="5.25" width="11" height="9.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7.5 8.5h5M7.5 11.5h3.25" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function getSyncViewIcon(view: SyncView) {
  if (view === 'status') return <StatusViewIcon />
  if (view === 'operations') return <OperationsViewIcon />
  if (view === 'history') return <HistoryViewIcon />
  return <WorkerViewIcon />
}

export function SyncPanel({
  canManageJobs,
  scopedCorpusSummary,
  scopedSiteSummaries,
  scopedSyncOverview,
  syncOperations,
  workerSettings,
}: {
  canManageJobs: boolean
  scopedCorpusSummary: AppModel['scopedCorpusSummary']
  scopedSiteSummaries: AppModel['scopedSiteSummaries']
  scopedSyncOverview: AppModel['scopedSyncOverview']
  syncOperations: AppModel['syncOperations']
  workerSettings: WorkerSettings
}) {
  const consoleRef = useRef<HTMLDivElement | null>(null)
  const currentJob = syncOperations.activeJob
  const currentLines = currentJob?.lines || []
  const [pendingOp, setPendingOp] = useState<OpsKey | null>(null)
  const [elapsed, setElapsed] = useState<number>(0)
  const [syncView, setSyncView] = useState<SyncView>(() => parseSyncView(window.location.hash))
  const [historyLogLineLimit, setHistoryLogLineLimit] = useState<10 | 20 | 50>(20)

  useEffect(() => {
    if (currentJob?.status !== 'running') {
      setElapsed(0)
      return
    }
    const start = new Date(currentJob.startedAt).getTime()
    setElapsed(Date.now() - start)
    const id = window.setInterval(() => setElapsed(Date.now() - start), 1000)
    return () => window.clearInterval(id)
  }, [currentJob?.id, currentJob?.status, currentJob?.startedAt])

  useEffect(() => {
    const node = consoleRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [currentJob?.id, currentLines.length])

  // Auto-switch to operations when a job starts
  useEffect(() => {
    if (currentJob?.status === 'running') {
      setSyncView('operations')
    }
  }, [currentJob?.status])

  useEffect(() => {
    const syncFromHash = () => {
      setSyncView(parseSyncView(window.location.hash))
    }

    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  useEffect(() => {
    const nextHash = serializeSyncView(syncView)
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash)
    }
  }, [syncView])

  function confirm(op: OpsKey) {
    setPendingOp(null)
    if (op === 'ingest') syncOperations.startIngest()
    else if (op === 'analyze') syncOperations.startAnalyze()
    else if (op === 'publishAnalysis') syncOperations.startPublishAnalysis()
    else if (op === 'evaluate') syncOperations.startEvaluate()
    else if (op === 'refresh') syncOperations.startRefresh()
    else if (op === 'exportLive') syncOperations.startExportLive()
    else if (op === 'exportLiveResume') syncOperations.startExportLiveResume()
  }

  const pending = pendingOp ? OPS_CONFIG[pendingOp] : null

  const failedJobs = syncOperations.history.filter((j) => j.status === 'failed')

  return (
    <section className="sync-stack">
      {pending ? (
        <ConfirmModal
          title={pending.label}
          description={pending.description}
          warning={pending.warning}
          confirmLabel={pending.confirmLabel}
          onConfirm={() => confirm(pendingOp!)}
          onCancel={() => setPendingOp(null)}
        />
      ) : null}

      <article className="panel sync-view-switcher" aria-label="Knowledge View">
        <div className="sync-view-switcher-head">
          <div>
            <h2>Knowledge View</h2>
            <p>Switch between coverage, execution, history, and worker settings from one view.</p>
          </div>
          <div className="sync-view-switcher-meta" aria-label="Current sync view summary">
            <div className="sync-view-switcher-meta-card">
              <span>Last job</span>
              <strong>{currentJob ? currentJob.status : 'idle'}</strong>
            </div>
          </div>
        </div>

        <nav className="sync-subnav" aria-label="Knowledge View">
          {SYNC_VIEWS.map(({ id, label, detail }) => (
            <button
              key={id}
              type="button"
              className={`sync-subnav-item ${syncView === id ? 'sync-subnav-item-active' : ''}`}
              aria-label={label}
              aria-current={syncView === id ? 'page' : undefined}
              title={detail}
              onClick={() => setSyncView(id)}
            >
              <span className="sync-subnav-title-row">
                <span className="sync-subnav-icon" aria-hidden="true">{getSyncViewIcon(id)}</span>
                <span className="sync-subnav-label">{label}</span>
              </span>
              <span className="sync-subnav-detail">{detail}</span>
              <span className="sync-subnav-status">
                {id === 'operations' && syncOperations.isRunning ? 'Running' : null}
                {id === 'history' && syncOperations.history.length > 0 ? `${syncOperations.history.length} runs` : null}
                {id === 'status' && currentJob ? currentJob.status : null}
                {id === 'config' ? workerSettings.workerMode : null}
              </span>
            </button>
          ))}
        </nav>
      </article>

      {/* Status view — concise summary */}
      {syncView === 'status' ? (
        <article id="sync-status-panel" className="panel sync-view-panel" aria-label="Knowledge summary">
          <SectionHeading title="Knowledge" subtitleTooltip="Refresh state, ingestion coverage, and operational signals." />
          <div className="sync-config-pills" aria-label="Knowledge summary statistics">
            <div className="sync-config-pill" title="Sites currently in a synced state within the active scope.">
              <span className="sync-config-pill-label">Synced sites</span>
              <strong className="sync-config-pill-value">{scopedSyncOverview.syncedSites}</strong>
            </div>
            <div className="sync-config-pill" title="Sites visible only to privileged roles within the active scope.">
              <span className="sync-config-pill-label">Restricted sites</span>
              <strong className="sync-config-pill-value">{scopedSyncOverview.restrictedSites}</strong>
            </div>
            <div className="sync-config-pill" title="Sources accessible to the selected role and scope.">
              <span className="sync-config-pill-label">Visible sources</span>
              <strong className="sync-config-pill-value">{scopedCorpusSummary.visibleSources}</strong>
            </div>
            <div className="sync-config-pill" title="Sources excluded by permission-aware retrieval in scope.">
              <span className="sync-config-pill-label">Denied sources</span>
              <strong className="sync-config-pill-value">{scopedCorpusSummary.deniedSources}</strong>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Status</th>
                  <th>Documents</th>
                  <th>Chunks</th>
                  <th>Last refresh</th>
                </tr>
              </thead>
              <tbody>
                {scopedSiteSummaries.map((site) => (
                  <tr key={site.id}>
                    <td>
                      <strong>{site.name}</strong>
                      <div className="table-subtitle">{site.owner}</div>
                    </td>
                    <td>{site.lastRefreshStatus}</td>
                    <td>{site.permittedDocumentCount}</td>
                    <td>{site.chunkCount}</td>
                    <td>{site.lastRefresh ? formatUpdatedAt(site.lastRefresh) : 'n/a'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Quick summary of active/last job */}
          {currentJob ? (
            <div className="sync-status-job-summary">
              <div className="detail-row">
                <span>Last operation</span>
                <strong>{currentJob.label}</strong>
              </div>
              <div className="detail-row">
                <span>Status</span>
                <Pill tone={getJobTone(currentJob.status)}>{currentJob.status}</Pill>
              </div>
              {currentJob.status === 'running' ? (
                <div className="detail-row">
                  <span>Progress</span>
                  <strong>{currentJob.progress}%</strong>
                </div>
              ) : null}
              <button
                type="button"
                className="secondary-button secondary-button-sm"
                onClick={() => setSyncView('operations')}
              >
                View operations
              </button>
            </div>
          ) : null}
        </article>
      ) : null}

      {/* Operations view — controls + console */}
      {syncView === 'operations' ? (
        <>
          <article className="panel sync-controls-panel" aria-label="Sync operations controls">
            <div className="sync-controls-panel-body">
              <div className="sync-controls-group">
                <span className="sync-controls-label">Knowledge</span>
                <div className="sync-controls-actions">
                  {canManageJobs ? (
                    (['refresh', 'exportLive', 'exportLiveResume'] as OpsKey[]).map((op) => (
                      <button
                        key={op}
                        type="button"
                        className="secondary-button secondary-button-sm"
                        data-tooltip={OPS_CONFIG[op].tooltip}
                        onClick={() => setPendingOp(op)}
                        disabled={syncOperations.isRunning}
                      >
                        <span className="sync-action-icon" aria-hidden="true">
                          {op === 'refresh' ? <RefreshIcon /> : null}
                          {op === 'exportLive' ? <StartSyncIcon /> : null}
                          {op === 'exportLiveResume' ? <ResumeSyncIcon /> : null}
                        </span>
                        {OPS_CONFIG[op].label}
                      </button>
                    ))
                  ) : (
                    <p className="empty-state">Hosted team members can review status and history here, but only operators can launch knowledge jobs.</p>
                  )}
                </div>
              </div>

              <div className="sync-controls-divider" />

              <div className="sync-controls-group">
                <span className="sync-controls-label">Local pipeline</span>
                <div className="sync-controls-actions">
                  {canManageJobs
                    ? (['ingest', 'analyze', 'publishAnalysis', 'evaluate'] as OpsKey[]).map((op) => (
                        <button
                          key={op}
                          type="button"
                          className="secondary-button secondary-button-sm"
                          data-tooltip={OPS_CONFIG[op].tooltip}
                          onClick={() => setPendingOp(op)}
                          disabled={syncOperations.isRunning}
                        >
                          <span className="sync-action-icon" aria-hidden="true">
                            {op === 'ingest' ? <IngestIcon /> : null}
                            {op === 'analyze' ? <AnalyzeIcon /> : null}
                            {op === 'publishAnalysis' ? <PublishAnalysisIcon /> : null}
                            {op === 'evaluate' ? <EvaluateIcon /> : null}
                          </span>
                          {OPS_CONFIG[op].label}
                        </button>
                      ))
                    : null}
                </div>
              </div>
            </div>
          </article>

          <article className="panel sync-ops-panel" aria-label="Operations console">
            <SectionHeading
              title="Operations console"
              subtitleTooltip="Follow the streamed execution log for the active operation."
              actions={
                syncOperations.isRunning && canManageJobs ? (
                  <button
                    type="button"
                    className="secondary-button secondary-button-sm danger-button"
                    data-tooltip="Stop the running operation"
                    onClick={syncOperations.cancelActiveJob}
                  >
                    Cancel job
                  </button>
                ) : null
              }
            />

            <div className="sync-ops-summary">
              <div className="detail-row">
                <span>Status</span>
                <strong>{currentJob?.status || 'idle'}</strong>
              </div>
              <div className="detail-row">
                <span>Command</span>
                <strong>{currentJob?.command || 'No command running'}</strong>
              </div>
              <div className="detail-row">
                <span>Progress</span>
                <strong>
                  {currentJob
                    ? `${currentJob.progress}%${
                        currentJob.status === 'running'
                          ? ` (${formatDuration(elapsed)})`
                          : currentJob.durationMs != null
                            ? ` (${formatDuration(currentJob.durationMs)})`
                            : ''
                      }`
                    : '0%'}
                </strong>
              </div>
            </div>

            <div className="sync-progress" aria-label="Sync operation progress">
              <div className="sync-progress-track">
                <span style={{ width: `${currentJob?.progress || 0}%` }} />
              </div>
              <div className="sync-progress-labels">
                <span>{currentJob?.label || 'Idle'}</span>
                <span>{currentJob?.summary || 'No sync job running yet.'}</span>
              </div>
            </div>

            <div className="sync-console" ref={consoleRef} aria-live="polite" aria-label="Sync console output">
              {currentLines.length ? (
                currentLines.map((line) => (
                  <div key={line.id} className={`sync-console-line sync-console-line-${line.tone}`}>
                    <span className="sync-console-timestamp">{formatUpdatedAt(line.timestamp)}</span>
                    <span className="sync-console-text">{line.text}</span>
                  </div>
                ))
              ) : (
                <div className="sync-console-empty">Launch a command to stream the execution log here.</div>
              )}
            </div>
          </article>
        </>
      ) : null}

      {/* History view — run list */}
      {syncView === 'history' ? (
        <article className="panel sync-view-panel" aria-label="Sync run history">
          <SectionHeading
            title="Run history"
            subtitleTooltip="Recent sync jobs and their results. Hover each run for the full note."
            actions={(
              <div className="sync-history-limit-picker" aria-label="Terminal log line limit">
                {[10, 20, 50].map((limit) => (
                  <button
                    key={limit}
                    type="button"
                    className={`sync-history-limit-button ${historyLogLineLimit === limit ? 'sync-history-limit-button-active' : ''}`}
                    aria-pressed={historyLogLineLimit === limit}
                    onClick={() => setHistoryLogLineLimit(limit as 10 | 20 | 50)}
                  >
                    {limit}
                  </button>
                ))}
              </div>
            )}
          />

          <div className="sync-list">
            {syncOperations.history.length ? (
              syncOperations.history.map((job) => (
                <article key={job.id} className="sync-card" title={job.summary}>
                  <div className="source-card-top">
                    <strong>{job.label}</strong>
                    <Pill tone={getJobTone(job.status)}>{job.status}</Pill>
                  </div>
                  <div className="sync-history-meta">
                    <span className="sync-history-meta-time">
                      {job.finishedAt ? formatUpdatedAt(job.finishedAt) : formatUpdatedAt(job.startedAt)}
                    </span>
                    <div className="sync-history-meta-stats">
                      <span className="sync-history-stat">
                        <span className="sync-history-stat-label">Progress</span>
                        <strong>{job.progress}%</strong>
                      </span>
                      {job.durationMs != null ? (
                        <span className="sync-history-stat">
                          <span className="sync-history-stat-label">Duration</span>
                          <strong>{formatDuration(job.durationMs)}</strong>
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <details className="sync-history-details">
                    <summary className="sync-history-details-summary">
                      <span>Terminal log</span>
                      <span className="sync-history-details-toggle">
                        <span className="sync-history-details-toggle-show">Show</span>
                        <span className="sync-history-details-toggle-hide">Hide</span>
                      </span>
                    </summary>
                    <pre className="sync-history-log">
                      <code>{formatHistoryLog(job.lines || [], job.command, historyLogLineLimit)}</code>
                    </pre>
                  </details>
                  <p>{job.summary}</p>
                </article>
              ))
            ) : (
              <div className="empty-state">No sync jobs have been launched yet.</div>
            )}
          </div>

          <div className="checklist">
            <h3>Evaluation prep</h3>
            <ul>
              <li>
                Run <code>npm run ingest</code> to write the local sync snapshot.
              </li>
              <li>
                Run <code>npm run evaluate</code> to generate the V1 baseline report.
              </li>
              <li>Keep OpenAI as the baseline provider when comparing retrieval quality.</li>
            </ul>
          </div>
        </article>
      ) : null}

      {/* Config view — worker connection read-only */}
      {syncView === 'config' ? (
        <>
          <article className="panel sync-view-panel" aria-label="Worker configuration">
            <SectionHeading title="Config" subtitleTooltip="Active worker connection and fallback settings. Edit in Settings → Worker." />

            <div className="sync-config-pills" aria-label="Worker configuration summary">
              <div className="sync-config-pill" title="local uses the embedded Vite ops server.">
                <span className="sync-config-pill-label">Worker mode</span>
                <strong className="sync-config-pill-value">{workerSettings.workerMode}</strong>
              </div>
              <div className="sync-config-pill" title="Behavior when the worker is unreachable.">
                <span className="sync-config-pill-label">Fallback mode</span>
                <strong className="sync-config-pill-value">{workerSettings.workerFallbackMode}</strong>
              </div>
              <div className="sync-config-pill" title="Request timeout for worker API calls.">
                <span className="sync-config-pill-label">Timeout</span>
                <strong className="sync-config-pill-value">{workerSettings.workerTimeoutSeconds}s</strong>
              </div>
              <div className="sync-config-pill" title="Maximum number of documents Analyze enriches per run.">
                <span className="sync-config-pill-label">Analyze budget</span>
                <strong className="sync-config-pill-value">{workerSettings.analyzeLimit}</strong>
              </div>
            </div>

            {workerSettings.workerMode === 'remote' && workerSettings.workerUrl ? (
              <div className="sync-details-grid">
                <div className="detail-row">
                  <span>Worker URL</span>
                  <strong className="detail-value-compact">{workerSettings.workerUrl}</strong>
                </div>
                <div className="detail-row">
                  <span>Token</span>
                  <strong>{workerSettings.workerToken ? '●●●●●●●●' : 'Not set'}</strong>
                </div>
              </div>
            ) : null}

            {workerSettings.workerMode === 'local' ? (
              <div className="sync-callout">
                <p>Running in local mode. Jobs are executed by the embedded Vite ops server at the same origin.</p>
                <p>Switch to remote mode in <strong>Settings → Worker</strong> to point at a dedicated worker endpoint.</p>
              </div>
            ) : (
              <div className="sync-callout">
                <p>Running in remote mode. Jobs are dispatched to <strong>{workerSettings.workerUrl || 'the configured worker URL'}</strong>.</p>
                <p>Update connection settings in <strong>Settings → Worker</strong>.</p>
              </div>
            )}
          </article>

          {/* Recovery panel */}
          <article className="panel sync-view-panel" aria-label="Recovery">
            <SectionHeading title="Recovery" subtitleTooltip="Guidance for failed operations and unreachable workers." />

            {failedJobs.length > 0 ? (
              <div className="sync-list">
                {failedJobs.map((job) => (
                  <article key={job.id} className="sync-card" title={job.summary}>
                    <div className="source-card-top">
                      <strong>{job.label}</strong>
                      <Pill tone="danger">failed</Pill>
                    </div>
                    <div className="source-meta">
                      <span>{job.finishedAt ? formatUpdatedAt(job.finishedAt) : formatUpdatedAt(job.startedAt)}</span>
                      <span>{job.command}</span>
                    </div>
                    <p>{job.summary}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="sync-callout">
                <p>No failed jobs in recent history. Recovery guidance will appear here when a job fails.</p>
              </div>
            )}

            <div className="sync-callout">
              <p>If a sync fails, use <strong>Resume Sync</strong> in Operations to restart from the last checkpoint.</p>
              <p>If the worker is unreachable, check the Worker URL and token in Settings, or switch to local mode.</p>
              <p>If the worker remains unavailable and the fallback mode is <strong>read_only</strong>, continue in the published corpus until the endpoint is restored.</p>
            </div>
          </article>
        </>
      ) : null}
    </section>
  )
}
