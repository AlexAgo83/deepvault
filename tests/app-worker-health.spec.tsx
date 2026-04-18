import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { WORKER_SETTINGS_STORAGE_KEY, WORKER_TOKEN_STORAGE_KEY } from '../src/hooks/useWorkerSettings'

describe('DeepVault worker health', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
    sessionStorage.clear()
    window.location.hash = ''
  })

  it('checks the remote worker at startup and surfaces the result in Settings', async () => {
    localStorage.setItem(
      WORKER_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        workerMode: 'remote',
        workerUrl: 'https://worker.example.com',
        workerTimeoutSeconds: 30,
        workerFallbackMode: 'read_only',
        analyzeLimit: 12,
      }),
    )
    sessionStorage.setItem(WORKER_TOKEN_STORAGE_KEY, JSON.stringify({ workerToken: 'secret-token' }))

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        workerVersion: '1.4.0',
        mode: 'remote',
        timestamp: '2026-04-18T17:40:00Z',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'https://worker.example.com/api/health',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer secret-token',
          }),
        }),
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Worker' }))

    expect(await screen.findByText('Worker reachable')).toBeInTheDocument()
    expect(screen.getByText(/Worker 1\.4\.0 responded in remote mode/)).toBeInTheDocument()
  })
})
