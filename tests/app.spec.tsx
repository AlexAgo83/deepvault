import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { downloadTextFile } from '../src/lib/file-download'

vi.mock('../src/lib/file-download', () => ({
  downloadTextFile: vi.fn(),
}))

describe('DeepVault app', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('renders the explorer shell', async () => {
    render(<App />)

    await waitFor(() => expect(document.title).toBe('Nexus'))
    expect(screen.getByRole('dialog', { name: /getting started/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Explorer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bishop' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sync status' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(document.querySelectorAll('.nav-item-icon svg')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: 'Ask Bishop' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Version 1\.0\.0/)).not.toBeInTheDocument()
    expect(screen.queryByText('State')).not.toBeInTheDocument()
    expect(screen.queryByText('Pilot sites')).not.toBeInTheDocument()
  })

  it('opens the getting started modal on app load and dismisses it', async () => {
    const user = userEvent.setup()
    render(<App />)

    const dialog = screen.getByRole('dialog', { name: /getting started/i })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(/DeepVault is a local-first command center/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start exploring' }))

    expect(screen.queryByRole('dialog', { name: /getting started/i })).not.toBeInTheDocument()
  })

  it('returns to Bishop after asking a question', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    expect(screen.queryByLabelText('Explorer search')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Ask a question'), 'What is the budget for Q3 2025?')
    expect(screen.getByRole('checkbox', { name: 'Keep context' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Ask bishop' }))

    expect(screen.getByRole('button', { name: 'Thinking...' })).toBeDisabled()
    expect(screen.getByText('Bishop is drafting the answer from grounded sources.')).toBeInTheDocument()
    expect(await screen.findByText('Orchestration')).toBeInTheDocument()
    expect(await screen.findByText('fallback')).toBeInTheDocument()
    expect(await screen.findAllByText('The Q3 2025 budget is 4.8M USD.')).not.toHaveLength(0)
  })

  it('lets the bishop context toggle be changed from the conversation header', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Bishop' }))

    const toggle = screen.getByRole('checkbox', { name: 'Keep context' })
    expect(toggle).toBeChecked()

    await user.click(toggle)

    expect(toggle).not.toBeChecked()
    expect(localStorage.getItem('deepvault_bishop_context_enabled')).toBe('false')
  })

  it('shows the answer trace metrics after bishop responds', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    await user.type(screen.getByLabelText('Ask a question'), 'What is the budget for Q3 2025?')
    await user.click(screen.getByRole('button', { name: 'Ask bishop' }))
    await screen.findAllByText('The Q3 2025 budget is 4.8M USD.')

    const answerTrace = screen.getByText('Answer trace').closest('aside')
    expect(answerTrace).not.toBeNull()
    expect(within(answerTrace as HTMLElement).getByText('Chunk count')).toBeInTheDocument()
    expect(within(answerTrace as HTMLElement).getByText('Token count')).toBeInTheDocument()
    expect(within(answerTrace as HTMLElement).getByText('Latency')).toBeInTheDocument()
    await waitFor(() => expect(within(answerTrace as HTMLElement).getByText('answered')).toBeInTheDocument())
  })

  it('keeps explorer search hidden while bishop is active', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByLabelText('Explorer search')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Bishop' }))

    expect(screen.queryByLabelText('Explorer search')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Explorer' }))

    expect(screen.getByLabelText('Explorer search')).toBeInTheDocument()
  })

  it('marks the active navigation tab for accessibility', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('button', { name: 'Explorer' })).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByRole('button', { name: 'Sync status' }))

    expect(screen.getByRole('button', { name: 'Explorer' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Sync status' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens settings and persists provider keys locally', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByLabelText('OpenAI API key')).toBeInTheDocument()

    await user.type(screen.getByLabelText('OpenAI API key'), 'test-openai-key')

    expect(JSON.parse(localStorage.getItem('deepvault_provider_secrets') || '{}')).toMatchObject({
      openaiApiKey: 'test-openai-key',
      geminiApiKey: '',
      anthropicApiKey: '',
    })
  })

  it('uses the configured OpenAI key when Bishop calls the provider', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'OpenAI remote answer.',
            },
          },
        ],
        usage: {
          prompt_tokens: 111,
          completion_tokens: 22,
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.type(screen.getByLabelText('OpenAI API key'), 'test-openai-key')
    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    await user.type(screen.getByLabelText('Ask a question'), 'What is the budget for Q3 2025?')
    await user.click(screen.getByRole('button', { name: 'Ask bishop' }))

    expect(await screen.findByText('OpenAI remote answer.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-openai-key',
        }),
      }),
    )
  })

  it('shows the live fallback badge when live corpus data is missing', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => {
        throw new Error('should not be called')
      },
    })

    vi.stubEnv('VITE_DEEPVAULT_DATA_MODE', 'live')
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Sync status' }))
    expect(await screen.findByText('Live fallback')).toBeInTheDocument()
    expect(screen.getByTitle('Live corpus missing, fallback to mock')).toBeInTheDocument()
  })

  it('shows the offline corpus fallback indicator when live mode is selected without network', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))

    vi.stubEnv('VITE_DEEPVAULT_DATA_MODE', 'live')
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('navigator', { onLine: false })
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Sync status' }))
    expect(await screen.findByText('Offline — corpus mock')).toBeInTheDocument()
    expect(screen.getByTitle('Hors-ligne — corpus mock actif')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Explorer' }))
    expect(screen.getAllByText('Q3 2025 budget approval').length).toBeGreaterThan(0)
  })

  it('renders sync run notes and counts in the sync panel', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Sync status' }))

    expect(screen.getByText('Recent sync runs')).toBeInTheDocument()
    expect(screen.getByText('Synced sites')).toBeInTheDocument()
    expect(screen.getByText('Evaluation prep')).toBeInTheDocument()
  })

  it('streams sync operations into the console and tracks recent runs', async () => {
    vi.useFakeTimers()
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Sync status' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run ingest' }))

    expect(screen.getByRole('button', { name: 'Cancel job' })).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(220)
    })

    expect(screen.getAllByText((_, element) => element?.textContent?.includes('Starting local ingestion pipeline.') === true).length).toBeGreaterThan(0)

    await act(async () => {
      vi.advanceTimersByTime(2200)
    })

    expect(screen.getAllByText('100%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('completed').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Run ingest').length).toBeGreaterThan(0)
    vi.useRealTimers()
  })

  it('keeps the explorer detail pane within the selected site scope', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getAllByText('Q3 2025 budget approval').length).toBeGreaterThan(0)
    const firstDocumentRow = screen.getByRole('button', { name: /Q3 2025 budget approval/i })
    expect(firstDocumentRow).toHaveTextContent('document')
    expect(within(firstDocumentRow).getByText('document')).toHaveClass('file-type-pill')
    const pathLinks = screen.getAllByRole('link')
    expect(pathLinks.length).toBeGreaterThan(0)
    expect(pathLinks.some((link) => link.getAttribute('href')?.startsWith('http'))).toBe(true)
    expect(pathLinks.some((link) => link.getAttribute('target') === '_blank')).toBe(true)
    for (const pathLabel of pathLinks) {
      expect(pathLabel.textContent).not.toContain('/')
    }

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Pilot Site Beta' }))
    expect(screen.getByText('Runtime')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Explorer' }))

    expect(screen.queryAllByText('Q3 2025 budget approval')).toHaveLength(0)
    expect(screen.getAllByText('Remote access security requirements').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Known SSO implementation issues' })).toBeInTheDocument()
  })

  it('shows the sync tab without runtime controls and the empty explorer state for an impossible filter', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Sync status' }))
    expect(screen.queryByLabelText('Explorer search')).not.toBeInTheDocument()

    expect(screen.getByText('Synced sites')).toBeInTheDocument()
    expect(screen.getByText('Recent sync runs')).toBeInTheDocument()
    expect(screen.queryByText('Runtime')).not.toBeInTheDocument()
    expect(screen.queryByText('Site scope')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Restricted Pilot Site' }))

    await user.click(screen.getByRole('button', { name: 'Explorer' }))
    await user.type(screen.getByLabelText('Explorer search'), 'budget')

    expect(screen.getByText('No visible document')).toBeInTheDocument()
    expect(screen.getByText('No permitted sources match the current site filter.')).toBeInTheDocument()
  })

  it('keeps Bishop answers scoped to the selected site context', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Restricted Pilot Site' }))
    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    await user.type(screen.getByLabelText('Ask a question'), 'What is the budget for Q3 2025?')
    await user.click(screen.getByRole('button', { name: 'Ask bishop' }))

    expect(await screen.findByText('No relevant content was found in the indexed pilot corpus.')).toBeInTheDocument()
  })

  it('restores bishop history from localStorage', async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      'deepvault_bishop_history',
      JSON.stringify({
        exportedAt: '2026-04-12T00:00:00.000Z',
        messages: [
          {
            id: 'seed',
            role: 'assistant',
            text: 'Ask a question about the pilot corpus, or switch to the explorer to inspect a source directly.',
            status: 'ready',
            sources: [],
            createdAt: '2026-04-12T00:00:00.000Z',
          },
          {
            id: 'saved-answer',
            role: 'assistant',
            text: 'Saved Bishop answer.',
            status: 'answered',
            sources: [],
            createdAt: '2026-04-12T00:01:00.000Z',
          },
        ],
      }),
    )

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    expect(screen.getByText('Saved Bishop answer.')).toBeInTheDocument()
  })

  it('exports Bishop and Explorer data and clears Bishop history', async () => {
    const user = userEvent.setup()
    const mockedDownload = vi.mocked(downloadTextFile)

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    await user.click(screen.getByRole('button', { name: 'Export JSON' }))

    expect(mockedDownload).toHaveBeenCalledWith(
      expect.stringContaining('deepvault-bishop-'),
      expect.stringContaining('"messages"'),
      'application/json',
    )

    await user.click(screen.getByRole('button', { name: 'Clear history' }))
    expect(localStorage.getItem('deepvault_bishop_history')).toBeNull()
    expect(screen.getByText('Ask a question about the pilot corpus, or switch to the explorer to inspect a source directly.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Explorer' }))
    await user.click(screen.getByRole('button', { name: 'Export MD' }))

    expect(mockedDownload).toHaveBeenCalledWith(
      expect.stringContaining('deepvault-explorer-'),
      expect.stringContaining('# Explorer results export'),
      'text/markdown',
    )
  })
})
