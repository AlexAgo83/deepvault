import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkerClient, type WorkerClientConfig } from '../src/lib/worker-client'
import { WORKER_SETTINGS_DEFAULTS } from '../src/hooks/useWorkerSettings'

const LOCAL_CONFIG: WorkerClientConfig = {
  ...WORKER_SETTINGS_DEFAULTS,
  workerMode: 'local',
  workerUrl: '',
}

const REMOTE_CONFIG: WorkerClientConfig = {
  ...WORKER_SETTINGS_DEFAULTS,
  workerMode: 'remote',
  workerUrl: 'https://worker.example.com',
  workerToken: 'test-token',
}

function mockFetch(response: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
  }))
}

describe('createWorkerClient — local mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('checkHealth hits /api/worker/health with no base', async () => {
    mockFetch({ status: 'ok', version: '1.0.0' })
    const client = createWorkerClient(LOCAL_CONFIG)
    const health = await client.checkHealth()
    expect(health.status).toBe('ok')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/worker/health',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('getEffectiveConfig hits /api/worker/config/effective', async () => {
    mockFetch({ workerMode: 'local', workerUrl: '', workerFallbackMode: 'read_only', workerTimeoutSeconds: 30, dataMode: 'mock' })
    const client = createWorkerClient(LOCAL_CONFIG)
    const config = await client.getEffectiveConfig()
    expect(config.workerMode).toBe('local')
  })

  it('startJob posts to /api/worker/jobs', async () => {
    mockFetch({ jobId: 'job-abc' }, 201)
    const client = createWorkerClient(LOCAL_CONFIG)
    const result = await client.startJob({ kind: 'ingest', env: { OPENAI_API_KEY: 'sk-test' } })
    expect(result.jobId).toBe('job-abc')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/worker/jobs',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('getJob fetches /api/worker/jobs/:id', async () => {
    mockFetch({ id: 'job-abc', kind: 'ingest', status: 'running', startedAt: '2026-04-14T10:00:00Z', progress: 50 })
    const client = createWorkerClient(LOCAL_CONFIG)
    const job = await client.getJob('job-abc')
    expect(job.id).toBe('job-abc')
    expect(job.status).toBe('running')
  })

  it('cancelJob posts to /api/worker/jobs/:id/cancel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) }))
    const client = createWorkerClient(LOCAL_CONFIG)
    await expect(client.cancelJob('job-abc')).resolves.toBeUndefined()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/worker/jobs/job-abc/cancel',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('getManifest fetches /api/worker/jobs/:id/manifest', async () => {
    mockFetch({ jobId: 'job-abc', kind: 'ingest', status: 'completed', schemaVersion: '1.0', startedAt: '2026-04-14T10:00:00Z', progress: 100 })
    const client = createWorkerClient(LOCAL_CONFIG)
    const manifest = await client.getManifest('job-abc')
    expect(manifest.jobId).toBe('job-abc')
    expect(manifest.schemaVersion).toBe('1.0')
  })

  it('openJobEvents returns an EventSource for /api/worker/jobs/:id/events', () => {
    const mockES = { close: vi.fn(), onmessage: null, onerror: null }
    vi.stubGlobal('EventSource', vi.fn(() => mockES))
    const client = createWorkerClient(LOCAL_CONFIG)
    const es = client.openJobEvents('job-abc')
    expect(vi.mocked(EventSource)).toHaveBeenCalledWith('/api/worker/jobs/job-abc/events')
    expect(es).toBe(mockES)
  })

  it('throws when the server returns a non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) }))
    const client = createWorkerClient(LOCAL_CONFIG)
    await expect(client.checkHealth()).rejects.toThrow()
  })

  it('includes worker error details when startJob returns a JSON error payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ error: 'AADSTS7000215: Invalid client secret provided.' })),
    }))

    const client = createWorkerClient(LOCAL_CONFIG)

    await expect(client.startJob({ kind: 'export-live' })).rejects.toThrow(
      'Failed to start job: 400: AADSTS7000215: Invalid client secret provided.',
    )
  })
})

describe('createWorkerClient — remote mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('prepends workerUrl to request paths', async () => {
    mockFetch({ status: 'ok', version: '1.0.0' })
    const client = createWorkerClient(REMOTE_CONFIG)
    await client.checkHealth()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://worker.example.com/api/worker/health',
      expect.anything(),
    )
  })

  it('strips trailing slash from workerUrl', async () => {
    mockFetch({ status: 'ok', version: '1.0.0' })
    const client = createWorkerClient({ ...REMOTE_CONFIG, workerUrl: 'https://worker.example.com/' })
    await client.checkHealth()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://worker.example.com/api/worker/health',
      expect.anything(),
    )
  })

  it('includes Authorization header when token is set', async () => {
    mockFetch({ jobId: 'job-xyz' }, 201)
    const client = createWorkerClient(REMOTE_CONFIG)
    await client.startJob({ kind: 'evaluate' })
    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token')
    expect((options.headers as Record<string, string>)['X-DeepVault-Client']).toBe('deepvault-app-shell')
  })

  it('does not include Authorization header when token is empty', async () => {
    mockFetch({ status: 'ok', version: '1.0.0' })
    const client = createWorkerClient({ ...LOCAL_CONFIG, workerToken: '' })
    await client.checkHealth()
    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect((options.headers as Record<string, string>)['Authorization']).toBeUndefined()
  })

  it('rejects remote worker configs without https or token', () => {
    expect(() => createWorkerClient({ ...REMOTE_CONFIG, workerUrl: 'http://worker.example.com' })).toThrow(
      'Remote worker mode requires an https workerUrl.',
    )
    expect(() => createWorkerClient({ ...REMOTE_CONFIG, workerToken: '' })).toThrow(
      'Remote worker mode requires a workerToken.',
    )
  })

  it('attaches token and client metadata to event stream URLs in remote mode', () => {
    const reader = {
      read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    }))
    vi.stubGlobal('EventSource', vi.fn())
    const client = createWorkerClient(REMOTE_CONFIG)
    client.openJobEvents('job-abc')
    expect(vi.mocked(EventSource)).not.toHaveBeenCalled()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://worker.example.com/api/worker/jobs/job-abc/events',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'X-DeepVault-Client': 'deepvault-app-shell',
        }),
      }),
    )
  })

  it('parses buffered SSE chunks in remote mode and emits messages', async () => {
    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('data: {"type":"line","text":"one"}\n\ndata: {"type":"line"'),
        })
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(',"text":"two"}\n\n'),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    }

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    }))

    const client = createWorkerClient(REMOTE_CONFIG)
    const stream = client.openJobEvents('job-stream')
    const messages: string[] = []

    stream.onmessage = (event) => {
      messages.push(event.data)
    }

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(messages).toEqual([
      '{"type":"line","text":"one"}',
      '{"type":"line","text":"two"}',
    ])
  })

  it('calls onerror when the remote event stream cannot be opened', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      body: null,
    }))

    const client = createWorkerClient(REMOTE_CONFIG)
    const stream = client.openJobEvents('job-fail')
    const onerror = vi.fn()
    stream.onerror = onerror

    await Promise.resolve()
    await Promise.resolve()

    expect(onerror).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith('Worker event stream failed', expect.any(Error))
  })
})

describe('createWorkerClient — timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('aborts the request after workerTimeoutSeconds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, options: RequestInit) => {
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      })
    }))
    const client = createWorkerClient({ ...LOCAL_CONFIG, workerTimeoutSeconds: 5 })
    const promise = client.checkHealth()
    vi.advanceTimersByTime(5001)
    await expect(promise).rejects.toThrow()
  })
})
