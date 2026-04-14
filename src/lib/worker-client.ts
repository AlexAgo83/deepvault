import type { WorkerFallbackMode, WorkerMode } from '../hooks/useWorkerSettings'

export interface WorkerClientConfig {
  workerMode: WorkerMode
  workerUrl: string
  workerToken: string
  workerTimeoutSeconds: number
  workerFallbackMode: WorkerFallbackMode
}

export interface WorkerHealth {
  status: 'ok' | 'degraded'
  version: string
  workerVersion?: string
  uptime?: number
}

export interface WorkerEffectiveConfig {
  workerMode: WorkerMode
  workerUrl: string
  workerFallbackMode: WorkerFallbackMode
  workerTimeoutSeconds: number
  dataMode: string
}

export type WorkerJobKind = 'ingest' | 'evaluate' | 'export-live' | 'export-live-resume'
export type WorkerJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'rejected'

export interface WorkerJob {
  id: string
  kind: WorkerJobKind
  status: WorkerJobStatus
  startedAt: string
  finishedAt?: string
  durationMs?: number
  progress: number
  exitCode?: number
  notes?: string
}

export interface WorkerJobManifest {
  jobId: string
  kind: WorkerJobKind
  status: WorkerJobStatus
  startedAt: string
  finishedAt?: string
  durationMs?: number
  progress: number
  exitCode?: number
  lineCount?: number
  summary?: string
  schemaVersion: string
}

export type WorkerReachability = 'reachable' | 'unreachable' | 'unknown'

export interface WorkerStartJobPayload {
  kind: WorkerJobKind
  env?: Record<string, string>
}

export interface WorkerStartJobResponse {
  jobId: string
}

function buildHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

function resolveBase(config: WorkerClientConfig): string {
  if (config.workerMode === 'remote' && config.workerUrl) {
    return config.workerUrl.replace(/\/$/, '')
  }
  // local mode: same origin
  return ''
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export function createWorkerClient(config: WorkerClientConfig) {
  const base = resolveBase(config)
  const headers = buildHeaders(config.workerToken)
  const timeoutMs = config.workerTimeoutSeconds * 1000

  async function checkHealth(): Promise<WorkerHealth> {
    const res = await fetchWithTimeout(`${base}/api/worker/health`, { headers }, timeoutMs)
    if (!res.ok) throw new Error(`Worker health check failed: ${res.status}`)
    return res.json() as Promise<WorkerHealth>
  }

  async function getEffectiveConfig(): Promise<WorkerEffectiveConfig> {
    const res = await fetchWithTimeout(`${base}/api/worker/config/effective`, { headers }, timeoutMs)
    if (!res.ok) throw new Error(`Failed to fetch effective config: ${res.status}`)
    return res.json() as Promise<WorkerEffectiveConfig>
  }

  async function startJob(payload: WorkerStartJobPayload): Promise<WorkerStartJobResponse> {
    const res = await fetchWithTimeout(
      `${base}/api/worker/jobs`,
      { method: 'POST', headers, body: JSON.stringify(payload) },
      timeoutMs,
    )
    if (!res.ok) throw new Error(`Failed to start job: ${res.status}`)
    return res.json() as Promise<WorkerStartJobResponse>
  }

  async function getJob(jobId: string): Promise<WorkerJob> {
    const res = await fetchWithTimeout(`${base}/api/worker/jobs/${jobId}`, { headers }, timeoutMs)
    if (!res.ok) throw new Error(`Failed to fetch job ${jobId}: ${res.status}`)
    return res.json() as Promise<WorkerJob>
  }

  async function cancelJob(jobId: string): Promise<void> {
    await fetchWithTimeout(
      `${base}/api/worker/jobs/${jobId}/cancel`,
      { method: 'POST', headers },
      timeoutMs,
    )
  }

  async function getManifest(jobId: string): Promise<WorkerJobManifest> {
    const res = await fetchWithTimeout(`${base}/api/worker/jobs/${jobId}/manifest`, { headers }, timeoutMs)
    if (!res.ok) throw new Error(`Failed to fetch manifest for ${jobId}: ${res.status}`)
    return res.json() as Promise<WorkerJobManifest>
  }

  function openJobEvents(jobId: string): EventSource {
    // EventSource does not support custom headers; for authenticated remote workers,
    // token may be passed as a query param when required. For now, local mode is unauthenticated.
    return new EventSource(`${base}/api/worker/jobs/${jobId}/events`)
  }

  return {
    checkHealth,
    getEffectiveConfig,
    startJob,
    getJob,
    cancelJob,
    getManifest,
    openJobEvents,
  }
}

export type WorkerClient = ReturnType<typeof createWorkerClient>
