import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompactPathText, Message, PathLabel, SectionHeading, StatCard } from '../src/components/app-ui'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('app ui helpers', () => {
  it('renders link and copy variants for path labels', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(
      <div>
        <PathLabel value="/sites/site-a/Documents/Plan.docx" href="https://example.test/file.docx" />
        <PathLabel value="/sites/site-a/Documents/Plan.docx" />
      </div>,
    )

    expect(screen.getByRole('link', { name: /plan\.docx/i })).toHaveAttribute('href', 'https://example.test/file.docx')
    const button = screen.getByRole('button', { name: /copy full path/i })
    fireEvent.click(button)
    expect(writeText).toHaveBeenCalledWith('/sites/site-a/Documents/Plan.docx')
  })

  it('renders compact path text with and without a marker', () => {
    const { container } = render(
      <div>
        <CompactPathText value="Path: /sites/site-a/Documents/Plan.docx" href="https://example.test/file.docx" />
        <CompactPathText value="Plain text only" />
      </div>,
    )

    expect(screen.getByRole('link', { name: /plan\.docx/i })).toBeInTheDocument()
    expect(container).toHaveTextContent('Plain text only')
  })

  it('renders section headings with and without subtitle/actions', () => {
    render(
      <div>
        <SectionHeading title="Explorer" subtitle="Browse the pilot corpus." actions={<button type="button">Export</button>} />
        <SectionHeading title="Minimal" />
      </div>,
    )

    expect(screen.getByText('Explorer')).toBeInTheDocument()
    expect(screen.getByText('Browse the pilot corpus.')).toBeInTheDocument()
    expect(screen.getByText('Export')).toBeInTheDocument()
    expect(screen.getByText('Minimal')).toBeInTheDocument()
  })

  it('renders stat cards with hover tooltips', () => {
    render(<StatCard label="Sites in scope" value={3} note="Shared across Explorer, Bishop, and Sync status." />)

    const statCard = screen.getByText('Sites in scope').closest('.stat-card')
    expect(statCard).toHaveAttribute('title', 'Shared across Explorer, Bishop, and Sync status.')
    expect(screen.queryByText('Shared across Explorer, Bishop, and Sync status.')).not.toBeInTheDocument()
  })

  it('renders messages with and without sources', async () => {
    const resolveFileHref = vi.fn().mockReturnValue('https://example.test/source.docx')
    const user = userEvent.setup()

    render(
      <div>
        <Message
          message={{
            id: 'assistant-1',
            role: 'assistant',
            text: 'Grounded answer',
            status: 'answered',
            sources: [
              {
                id: 'source-1',
                title: 'Budget',
                siteId: 'site-a',
                siteName: 'Site A',
                path: '/Documents/Budget.docx',
                updatedAt: '2026-04-10T10:00:00Z',
                author: 'Ops',
                score: 12,
                summary: 'Budget summary',
                snippet: 'Budget summary',
                tags: ['finance'],
                access: ['analyst'],
                source: 'sharepoint',
              },
            ],
          }}
          resolveFileHref={resolveFileHref}
        />
        <Message
          message={{
            id: 'user-1',
            role: 'user',
            text: 'Question',
            status: '',
            sources: [],
          }}
          resolveFileHref={resolveFileHref}
        />
      </div>,
    )

    expect(screen.getByText('Bishop')).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.queryByText('Sources (1)')).not.toBeInTheDocument()
    expect(screen.queryByText('Site A')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show' }))
    expect(screen.getByText('Sources (1)')).toBeInTheDocument()
    expect(screen.getByText('Site A')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /budget\.docx/i })).toBeInTheDocument()
    expect(resolveFileHref).toHaveBeenCalledWith('site-a', '/Documents/Budget.docx', undefined)
  })

  it('renders hover confidence and need popovers in assistant messages', async () => {
    const user = userEvent.setup()
    render(
      <Message
        message={{
          id: 'assistant-1',
          role: 'assistant',
          text: 'Grounded answer',
          status: 'answered',
          sources: [],
          confidenceScore: 87,
          providerTracePreview: 'openai response: The answer is grounded and concise.',
          improvementHint: 'A more specific document title or site name would improve the response — try refining around circlesas, documents.',
        }}
        resolveFileHref={vi.fn()}
      />,
    )

    const confidenceButton = screen.getByRole('button', { name: '87%' })
    await user.hover(confidenceButton)
    expect(screen.getByText('openai response: The answer is grounded and concise.')).toBeInTheDocument()

    const needButton = screen.getByRole('button', { name: 'Show improvement hint' })
    await user.hover(needButton)
    expect(screen.getByText('A more specific document title or site name would improve the response — try refining around circlesas, documents.')).toBeInTheDocument()
  })
})
