import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SettingsPanel } from '../src/components/panels/settings-panel'
import { downloadTextFile } from '../src/lib/file-download'

vi.mock('../src/lib/file-download', () => ({
  downloadTextFile: vi.fn(),
}))

function createProps() {
  return {
    bishopSettings: {
      sourceLimit: 3,
      candidateLimit: 10,
      historyTurnLimit: 12,
    },
    conversationContextEnabled: true,
    corpusProviders: [
      { id: 'openai' as const, name: 'OpenAI', ready: true },
      { id: 'gemini' as const, name: 'Gemini', ready: false },
      { id: 'anthropic' as const, name: 'Claude', ready: false },
    ],
    entraSettings: {
      appId: 'app-id',
      tenantId: 'tenant-id',
      secretValue: 'secret-value',
      sites: 'https://tenant.sharepoint.com/sites/A',
      siteNames: 'Site A',
      dataMode: 'live' as const,
    },
    providerSecrets: {
      openaiApiKey: 'openai-key',
      geminiApiKey: 'gemini-key',
      anthropicApiKey: 'anthropic-key',
    },
    workerSettings: {
      workerMode: 'remote' as const,
      workerUrl: 'https://worker.example.com',
      workerToken: 'worker-token',
      workerTimeoutSeconds: 45,
      workerFallbackMode: 'block' as const,
      analyzeLimit: 25,
    },
    onClear: vi.fn(),
    onClearBishop: vi.fn(),
    onClearEntra: vi.fn(),
    onClearWorker: vi.fn(),
    onBishopChange: vi.fn(),
    onEntraChange: vi.fn(),
    onKeyChange: vi.fn(),
    onConversationContextEnabledChange: vi.fn(),
    onProviderChange: vi.fn(),
    onRoleChange: vi.fn(),
    onSiteFilterChange: vi.fn(),
    onWorkerChange: vi.fn(),
    showRightPanel: false,
    provider: 'openai',
    requestedView: 'worker' as const,
    role: 'admin',
    siteFilter: 'site-a',
    siteSummaries: [
      {
        id: 'site-a',
        name: 'Site A',
        url: 'https://tenant.sharepoint.com/sites/A',
        libraryCount: 1,
        listCount: 0,
        status: 'synced' as const,
        access: ['analyst', 'admin'] as Array<'analyst' | 'admin'>,
        owner: 'Site A',
        documentCount: 10,
        permittedDocumentCount: 10,
        chunkCount: 60,
        lastRefresh: '2026-04-18T16:00:00.000Z',
        lastRefreshStatus: 'synced' as const,
      },
    ],
  }
}

describe('SettingsPanel', () => {
  it('exports the full configuration snapshot as a local JSON download', async () => {
    const user = userEvent.setup()
    render(<SettingsPanel {...createProps()} />)

    await user.click(screen.getByRole('button', { name: 'Export configuration' }))

    expect(downloadTextFile).toHaveBeenCalledTimes(1)
    const [filename, content, mimeType] = vi.mocked(downloadTextFile).mock.calls[0] ?? []
    expect(filename).toMatch(/^deepvault-settings-\d{4}-\d{2}-\d{2}\.json$/)
    expect(mimeType).toBe('application/json')

    const payload = JSON.parse(String(content)) as Record<string, unknown>
    expect(payload.schemaVersion).toBe('1.0')
    expect(payload).toMatchObject({
      runtime: {
        role: 'admin',
        provider: 'openai',
        siteFilter: 'site-a',
        conversationContextEnabled: true,
      },
      bishopSettings: {
        sourceLimit: 3,
        candidateLimit: 10,
        historyTurnLimit: 12,
      },
      providerSecrets: {
        openaiApiKey: 'openai-key',
        geminiApiKey: 'gemini-key',
        anthropicApiKey: 'anthropic-key',
      },
      entraSettings: {
        appId: 'app-id',
        tenantId: 'tenant-id',
        secretValue: 'secret-value',
        sites: 'https://tenant.sharepoint.com/sites/A',
        siteNames: 'Site A',
        dataMode: 'live',
      },
      workerSettings: {
        workerMode: 'remote',
        workerUrl: 'https://worker.example.com',
        workerToken: 'worker-token',
        workerTimeoutSeconds: 45,
        workerFallbackMode: 'block',
        analyzeLimit: 25,
      },
    })
  })

  it('shows a clear error and does not apply partial writes for malformed imports', async () => {
    const user = userEvent.setup()
    const props = createProps()
    const { container } = render(<SettingsPanel {...props} />)
    const input = container.querySelector('input[type="file"]')

    expect(input).not.toBeNull()
    await user.upload(
      input as HTMLInputElement,
      new File(['{"schemaVersion":"1.0","runtime":{}}'], 'broken.json', { type: 'application/json' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Configuration import failed')
    expect(props.onRoleChange).not.toHaveBeenCalled()
    expect(props.onProviderChange).not.toHaveBeenCalled()
    expect(props.onKeyChange).not.toHaveBeenCalled()
    expect(props.onEntraChange).not.toHaveBeenCalled()
    expect(props.onWorkerChange).not.toHaveBeenCalled()
    expect(props.onBishopChange).not.toHaveBeenCalled()
  })

  it('requires explicit confirmation before applying an imported configuration', async () => {
    const user = userEvent.setup()
    const props = createProps()
    const { container } = render(<SettingsPanel {...props} />)
    const input = container.querySelector('input[type="file"]')

    const payload = {
      schemaVersion: '1.0',
      exportedAt: '2026-04-18T16:30:00.000Z',
      runtime: {
        role: 'guest',
        provider: 'gemini',
        siteFilter: 'all',
        conversationContextEnabled: false,
      },
      bishopSettings: {
        sourceLimit: 4,
        candidateLimit: 12,
        historyTurnLimit: 6,
      },
      providerSecrets: {
        openaiApiKey: 'new-openai',
        geminiApiKey: 'new-gemini',
        anthropicApiKey: 'new-anthropic',
      },
      entraSettings: {
        appId: 'new-app',
        tenantId: 'new-tenant',
        secretValue: 'new-secret',
        sites: 'https://tenant.sharepoint.com/sites/B',
        siteNames: 'Site B',
        dataMode: 'mock',
      },
      workerSettings: {
        workerMode: 'local',
        workerUrl: '',
        workerToken: '',
        workerTimeoutSeconds: 60,
        workerFallbackMode: 'read_only',
        analyzeLimit: 50,
      },
    }

    await user.upload(
      input as HTMLInputElement,
      new File([JSON.stringify(payload)], 'config.json', { type: 'application/json' }),
    )

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(props.onRoleChange).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Import and overwrite' }))

    expect(props.onRoleChange).toHaveBeenCalledWith('guest')
    expect(props.onProviderChange).toHaveBeenCalledWith('gemini')
    expect(props.onSiteFilterChange).toHaveBeenCalledWith('all')
    expect(props.onConversationContextEnabledChange).toHaveBeenCalledWith(false)
    expect(props.onBishopChange).toHaveBeenCalledWith('sourceLimit', 4)
    expect(props.onBishopChange).toHaveBeenCalledWith('candidateLimit', 12)
    expect(props.onBishopChange).toHaveBeenCalledWith('historyTurnLimit', 6)
    expect(props.onKeyChange).toHaveBeenCalledWith('openai', 'new-openai')
    expect(props.onKeyChange).toHaveBeenCalledWith('gemini', 'new-gemini')
    expect(props.onKeyChange).toHaveBeenCalledWith('anthropic', 'new-anthropic')
    expect(props.onEntraChange).toHaveBeenCalledWith('appId', 'new-app')
    expect(props.onWorkerChange).toHaveBeenCalledWith('workerTimeoutSeconds', 60)
  })
})
