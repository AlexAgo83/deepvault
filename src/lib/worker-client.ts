import type { WorkerFallbackMode, WorkerMode } from '../hooks/useWorkerSettings'

export interface WorkerClientConfig {
  workerMode: WorkerMode
  workerUrl: string
  workerToken: string
  authToken?: string
  workerTimeoutSeconds: number
  workerFallbackMode: WorkerFallbackMode
  analyzeLimit: number
  dataMode?: string
}

export interface WorkerHealth {
  status: 'ok' | 'degraded'
  workerVersion: string
  mode: string
  timestamp: string
}

export interface WorkerEffectiveConfig {
  workerMode: WorkerMode
  workerUrl: string
  workerFallbackMode: WorkerFallbackMode
  workerTimeoutSeconds: number
  analyzeLimit: number
  provider?: string
  dataMode: string
}

export interface WorkerAuditContext {
  launchedBy: string
  client: string
  effectiveConfig: WorkerEffectiveConfig
}

export type WorkerJobKind = 'ingest' | 'analyze' | 'publish-analysis' | 'evaluate' | 'export-live' | 'export-live-resume'
export type WorkerJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

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
  result?: Record<string, unknown>
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
  status?: 'running'
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

  const token = (config.authToken || config.workerToken).trim()
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

function validateRemoteConfig(config: WorkerClientConfig) {
  if (config.workerMode !== 'remote') return

  if (!config.workerUrl.trim()) {
    throw new Error('Remote worker mode requires a workerUrl.')
  }
  const trimmedWorkerUrl = config.workerUrl.trim()
  let parsedUrl: URL | null = null
  try {
    parsedUrl = new URL(trimmedWorkerUrl)
  } catch {
    parsedUrl = null
  }
  const isPermittedLocalHttp = parsedUrl?.protocol === 'http:' && (
    parsedUrl.hostname === 'localhost' ||
    parsedUrl.hostname === '127.0.0.1' ||
    parsedUrl.hostname === '::1'
  )
  if (!/^https:\/\//i.test(trimmedWorkerUrl) && !isPermittedLocalHttp) {
    throw new Error('Remote worker mode requires an https workerUrl, or http://localhost for local Docker testing.')
  }
  if (!config.workerToken.trim()) {
    throw new Error('Remote worker mode requires a workerToken.')
  }
}

function resolveBase(config: WorkerClientConfig): string {
  if (config.workerMode === 'remote' && config.workerUrl) {
    return config.workerUrl.replace(/\/$/, '')
  }
  // local mode (or remote not yet configured): same origin
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
        const nestedError = (
          payload.error &&
          typeof payload.error === 'object' &&
          'message' in payload.error &&
          typeof payload.error.message === 'string'
        ) ? payload.error.message : undefined
        const candidate = [payload.message, payload.error, payload.detail, payload.notes].find(
          (value) => typeof value === 'string' && value.trim().length > 0,
        )
        detail = typeof candidate === 'string' ? candidate.trim() : nestedError?.trim() || trimmed
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

  function normalizeEventPayload(eventName: string | null, data: string): string | null {
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>
      if (eventName === 'progress') {
        return JSON.stringify({
          type: 'progress',
          pct: typeof parsed.pct === 'number' ? parsed.pct : undefined,
          text: typeof parsed.message === 'string' ? parsed.message : undefined,
          step: typeof parsed.step === 'string' ? parsed.step : undefined,
        })
      }
      if (eventName === 'status') {
        const status = typeof parsed.status === 'string' ? parsed.status : ''
        if (status === 'succeeded') {
          return JSON.stringify({ type: 'done', exitCode: 0, text: parsed.message })
        }
        if (status === 'failed') {
          return JSON.stringify({ type: 'done', exitCode: 1, text: parsed.message, isError: true })
        }
        if (status === 'cancelled') {
          return JSON.stringify({ type: 'done', exitCode: 130, text: parsed.message, isError: true })
        }
        return JSON.stringify({ type: 'line', text: parsed.message, isError: false })
      }
      return data
    } catch {
      return data
    }
  }

  function emitBufferedEvents(flush = false) {
    const chunks = flush ? [buffer] : buffer.split('\n\n')
    if (!flush) {
      buffer = chunks.pop() || ''
    } else {
      buffer = ''
    }

    for (const chunk of chunks) {
      const lines = chunk.split('\n')
      const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() || null
      const data = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')

      if (data) {
        const normalized = normalizeEventPayload(eventName, data)
        if (normalized) {
          stream.onmessage?.({ data: normalized } as MessageEvent<string>)
        }
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

function mapJobKind(kind: WorkerJobKind): 'ingest' | 'analyze' | 'publish-analysis' | 'evaluate' | 'export-live' {
  if (kind === 'export-live-resume') return 'export-live'
  return kind
}

function mapWorkerStatus(status: string): WorkerJobStatus {
  if (status === 'completed') return 'completed'
  if (status === 'succeeded') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  return status === 'queued' ? 'queued' : 'running'
}

function mapWorkerJob(payload: Record<string, unknown>): WorkerJob {
  const startedAt = typeof payload.startedAt === 'string' ? payload.startedAt : new Date().toISOString()
  const finishedAt = typeof payload.finishedAt === 'string' ? payload.finishedAt : undefined
  const status = mapWorkerStatus(typeof payload.status === 'string' ? payload.status : 'running')
  const progress = status === 'completed' || status === 'cancelled' ? 100 : typeof payload.progress === 'number' ? payload.progress : 0
  return {
    id: String(payload.jobId || payload.id || ''),
    kind: String(payload.type || payload.kind || 'evaluate') as WorkerJobKind,
    status,
    startedAt,
    finishedAt,
    durationMs: finishedAt ? Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()) : undefined,
    progress,
    notes: typeof payload.summary === 'string'
      ? payload.summary
      : typeof payload.notes === 'string'
        ? payload.notes
        : typeof payload.error === 'string'
          ? payload.error
          : undefined,
    launchedBy: typeof payload.launchedBy === 'string' ? payload.launchedBy : undefined,
    client: typeof payload.client === 'string' ? payload.client : undefined,
    effectiveConfig: typeof payload.effectiveConfig === 'object' && payload.effectiveConfig !== null
      ? payload.effectiveConfig as WorkerEffectiveConfig
      : undefined,
    result: typeof payload.result === 'object' && payload.result !== null
      ? payload.result as Record<string, unknown>
      : undefined,
  }
}

export function createWorkerClient(config: WorkerClientConfig) {
  function getBase(): string {
    validateRemoteConfig(config)
    return resolveBase(config)
  }
  const auditContext: WorkerAuditContext = {
    launchedBy: 'deepvault-app-shell',
    client: 'deepvault-app-shell',
    effectiveConfig: {
      workerMode: config.workerMode,
      workerUrl: config.workerUrl,
      workerFallbackMode: config.workerFallbackMode,
      workerTimeoutSeconds: config.workerTimeoutSeconds,
      analyzeLimit: config.analyzeLimit,
      dataMode: config.dataMode || 'mock',
    },
  }
  const headers = buildHeaders(config, auditContext)
  const timeoutMs = config.workerTimeoutSeconds * 1000

  async function checkHealth(): Promise<WorkerHealth> {
    const base = getBase()
    const res = await fetchWithTimeout(`${base}/api/health`, { headers }, timeoutMs)
    if (!res.ok) throw await buildResponseError(res, `Worker health check failed: ${res.status}`)
    return res.json() as Promise<WorkerHealth>
  }

  async function getEffectiveConfig(): Promise<WorkerEffectiveConfig> {
    const base = getBase()
    const res = await fetchWithTimeout(`${base}/api/config/mode`, { headers }, timeoutMs)
    if (!res.ok) throw await buildResponseError(res, `Failed to fetch effective config: ${res.status}`)
    const payload = await res.json() as {
      mode: string
      workerVersion: string
      corpusVersion?: string | null
    }
    return {
      workerMode: config.workerMode,
      workerUrl: config.workerUrl,
      workerFallbackMode: config.workerFallbackMode,
      workerTimeoutSeconds: config.workerTimeoutSeconds,
      analyzeLimit: config.analyzeLimit,
      dataMode: config.dataMode || payload.mode || 'mock',
    }
  }

  async function startJob(payload: WorkerStartJobPayload): Promise<WorkerStartJobResponse> {
    const base = getBase()
    const res = await fetchWithTimeout(
      `${base}/api/jobs`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: mapJobKind(payload.kind),
          options: {
            env: payload.env || {},
          },
        }),
      },
      timeoutMs,
    )
    if (!res.ok) throw await buildResponseError(res, `Failed to start job: ${res.status}`)
    return res.json() as Promise<WorkerStartJobResponse>
  }

  async function getJob(jobId: string): Promise<WorkerJob> {
    const base = getBase()
    const res = await fetchWithTimeout(`${base}/api/jobs/${jobId}`, { headers }, timeoutMs)
    if (!res.ok) throw await buildResponseError(res, `Failed to fetch job ${jobId}: ${res.status}`)
    return mapWorkerJob(await res.json() as Record<string, unknown>)
  }

  async function cancelJob(jobId: string): Promise<void> {
    const base = getBase()
    const res = await fetchWithTimeout(`${base}/api/jobs/${jobId}/cancel`, { method: 'POST', headers }, timeoutMs)
    if (!res.ok) throw await buildResponseError(res, `Failed to cancel job ${jobId}: ${res.status}`)
  }

  function openJobEvents(jobId: string): WorkerEventStream {
    const base = getBase()
    if (config.workerMode !== 'remote') {
      return new EventSource(`${base}/api/jobs/${jobId}/events`) as unknown as WorkerEventStream
    }

    const controller = new AbortController()
    const stream: WorkerEventStream = {
      onmessage: null,
      onerror: null,
      close: () => controller.abort(),
    }

    void streamRemoteEvents(`${base}/api/jobs/${jobId}/events`, headers, controller.signal, stream)
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
    openJobEvents,
  }
}

export type WorkerClient = ReturnType<typeof createWorkerClient>
