import type { WorkerFallbackMode, WorkerMode } from '../hooks/useWorkerSettings'

export interface WorkerClientConfig {
  workerMode: WorkerMode
  workerUrl: string
  workerToken: string
  workerTimeoutSeconds: number
  workerFallbackMode: WorkerFallbackMode
  dataMode?: string
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

export interface WorkerAuditContext {
  launchedBy: string
  client: string
  effectiveConfig: WorkerEffectiveConfig
}

export type WorkerJobKind = 'ingest' | 'analyze' | 'evaluate' | 'export-live' | 'export-live-resume'
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
  launchedBy?: string
  client?: string
  effectiveConfig?: WorkerEffectiveConfig
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
  launchedBy?: string
  client?: string
  effectiveConfig?: WorkerEffectiveConfig
}

export type WorkerReachability = 'reachable' | 'unreachable' | 'unknown'

export interface WorkerStartJobPayload {
  kind: WorkerJobKind
  env?: Record<string, string>
  launchedBy?: string
  client?: string
  effectiveConfig?: WorkerEffectiveConfig
}

export interface WorkerStartJobResponse {
  jobId: string
}

export interface WorkerEventStream {
  onmessage: ((_event: MessageEvent<string>) => void) | null
  onerror: (() => void) | null
  close: () => void
}

function buildHeaders(config: WorkerClientConfig, audit?: WorkerAuditContext): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-DeepVault-Client': audit?.client || 'deepvault-app-shell',
    'X-DeepVault-Worker-Mode': config.workerMode,
    'X-DeepVault-Worker-Fallback': config.workerFallbackMode,
    'X-DeepVault-Worker-Timeout': String(config.workerTimeoutSeconds),
  }

  if (audit?.launchedBy) {
    headers['X-DeepVault-Launched-By'] = audit.launchedBy
  }
  if (audit?.effectiveConfig) {
    headers['X-DeepVault-Effective-Config'] = JSON.stringify(audit.effectiveConfig)
  }

  const token = config.workerToken.trim()
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

function validateRemoteConfig(config: WorkerClientConfig) {
  if (config.workerMode !== 'remote') return

  if (!config.workerUrl.trim()) {
    throw new Error('Remote worker mode requires a workerUrl.')
  }
  if (!/^https:\/\//i.test(config.workerUrl.trim())) {
    throw new Error('Remote worker mode requires an https workerUrl.')
  }
  if (!config.workerToken.trim()) {
    throw new Error('Remote worker mode requires a workerToken.')
  }
}

function resolveBase(config: WorkerClientConfig): string {
  validateRemoteConfig(config)
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

async function buildResponseError(response: Response, fallbackMessage: string): Promise<Error> {
  let detail = ''

  try {
    const text = await response.text()
    const trimmed = text.trim()
    if (trimmed) {
      try {
        const payload = JSON.parse(trimmed) as { error?: unknown; message?: unknown; detail?: unknown; notes?: unknown }
        const candidate = [payload.message, payload.error, payload.detail, payload.notes].find(
          (value) => typeof value === 'string' && value.trim().length > 0,
        )
        detail = typeof candidate === 'string' ? candidate.trim() : trimmed
      } catch {
        detail = trimmed
      }
    }
  } catch {
    // Keep the fallback when the response body cannot be read.
  }

  return new Error(detail ? `${fallbackMessage}: ${detail}` : fallbackMessage)
}

async function streamRemoteEvents(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  stream: WorkerEventStream,
): Promise<void> {
  const response = await fetch(url, { headers, signal })
  if (!response.ok || !response.body) {
    throw new Error(`Worker event stream failed: ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  function emitBufferedEvents(flush = false) {
    const chunks = flush ? [buffer] : buffer.split('\n\n')
    if (!flush) {
      buffer = chunks.pop() || ''
    } else {
      buffer = ''
    }

    for (const chunk of chunks) {
      const data = chunk
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')

      if (data) {
        stream.onmessage?.({ data } as MessageEvent<string>)
      }
    }
  }

  while (!signal.aborted) {
    const { done, value } = await reader.read()
    if (done) {
      buffer += decoder.decode()
      emitBufferedEvents(true)
      return
    }

    buffer += decoder.decode(value, { stream: true })
    emitBufferedEvents(false)
  }
}

export function createWorkerClient(config: WorkerClientConfig) {
  const base = resolveBase(config)
  const auditContext: WorkerAuditContext = {
    launchedBy: 'deepvault-app-shell',
    client: 'deepvault-app-shell',
    effectiveConfig: {
      workerMode: config.workerMode,
      workerUrl: config.workerUrl,
      workerFallbackMode: config.workerFallbackMode,
      workerTimeoutSeconds: config.workerTimeoutSeconds,
      dataMode: config.dataMode || 'mock',
    },
  }
  const headers = buildHeaders(config, auditContext)
  const timeoutMs = config.workerTimeoutSeconds * 1000

  async function checkHealth(): Promise<WorkerHealth> {
    const res = await fetchWithTimeout(`${base}/api/worker/health`, { headers }, timeoutMs)
    if (!res.ok) throw await buildResponseError(res, `Worker health check failed: ${res.status}`)
    return res.json() as Promise<WorkerHealth>
  }

  async function getEffectiveConfig(): Promise<WorkerEffectiveConfig> {
    const res = await fetchWithTimeout(`${base}/api/worker/config/effective`, { headers }, timeoutMs)
    if (!res.ok) throw await buildResponseError(res, `Failed to fetch effective config: ${res.status}`)
    return res.json() as Promise<WorkerEffectiveConfig>
  }

  async function startJob(payload: WorkerStartJobPayload): Promise<WorkerStartJobResponse> {
    const res = await fetchWithTimeout(
      `${base}/api/worker/jobs`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...payload,
          launchedBy: payload.launchedBy || auditContext.launchedBy,
          client: payload.client || auditContext.client,
          effectiveConfig: payload.effectiveConfig || auditContext.effectiveConfig,
        }),
      },
      timeoutMs,
    )
    if (!res.ok) throw await buildResponseError(res, `Failed to start job: ${res.status}`)
    return res.json() as Promise<WorkerStartJobResponse>
  }

  async function getJob(jobId: string): Promise<WorkerJob> {
    const res = await fetchWithTimeout(`${base}/api/worker/jobs/${jobId}`, { headers }, timeoutMs)
    if (!res.ok) throw await buildResponseError(res, `Failed to fetch job ${jobId}: ${res.status}`)
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
    if (!res.ok) throw await buildResponseError(res, `Failed to fetch manifest for ${jobId}: ${res.status}`)
    return res.json() as Promise<WorkerJobManifest>
  }

  function openJobEvents(jobId: string): WorkerEventStream {
    if (config.workerMode !== 'remote') {
      return new EventSource(`${base}/api/worker/jobs/${jobId}/events`) as unknown as WorkerEventStream
    }

    const controller = new AbortController()
    const stream: WorkerEventStream = {
      onmessage: null,
      onerror: null,
      close: () => controller.abort(),
    }

    void streamRemoteEvents(`${base}/api/worker/jobs/${jobId}/events`, headers, controller.signal, stream)
      .catch((error) => {
        if (controller.signal.aborted) {
          return
        }
        console.error('Worker event stream failed', error)
        stream.onerror?.()
      })

    return stream
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
