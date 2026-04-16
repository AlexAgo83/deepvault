import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AIStatsPanel } from '../src/components/panels/ai-stats-panel'

function assistantMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assistant-1',
    role: 'assistant',
    text: 'Budget answer',
    status: 'answered',
    sources: [],
    createdAt: '2026-04-16T10:00:00.000Z',
    provider: 'openai',
    orchestrationMode: 'remote',
    confidenceScore: 84,
    ...overrides,
  }
}

describe('AIStatsPanel', () => {
  it('renders empty states when there are no eligible assistant responses', () => {
    render(<AIStatsPanel messages={[{ id: 'seed', role: 'assistant', text: 'seed', status: 'draft' } as never]} resolveFileHref={() => null} showRightPanel={true} />)

    expect(screen.getByText('Ask Bishop a question to populate the response stats.')).toBeInTheDocument()
    expect(screen.getByText('No AI needs have been surfaced yet.')).toBeInTheDocument()
  })

  it('aggregates recurring AI needs and hides the right panel when requested', () => {
    render(
      <AIStatsPanel
        showRightPanel={false}
        resolveFileHref={() => null}
        messages={[
          { id: 'user-1', role: 'user', text: 'What is the budget?', status: 'answered' },
          assistantMessage({ id: '1', improvementHint: 'Need site name', text: 'one' }),
          { id: 'user-2', role: 'user', text: 'Which title should I inspect?', status: 'answered' },
          assistantMessage({ id: '2', improvementHint: 'Need document title', text: 'two', confidenceScore: undefined }),
          { id: 'user-3', role: 'user', text: 'Can you answer without more context?', status: 'answered' },
          assistantMessage({ id: '3', improvementHint: 'Need site name', text: 'three', status: 'no_answer' }),
          assistantMessage({ id: '4', improvementHint: 'Need site name', text: 'four', status: 'answering' }),
          { id: 'user-5', role: 'user', text: 'Show restricted sources', status: 'answered' },
          assistantMessage({ id: '5', text: 'five', status: 'no_permitted_sources' }),
        ] as never}
      />,
    )

    expect(screen.getAllByText('Answered response')).toHaveLength(2)
    expect(screen.getAllByText('no_answer')).toHaveLength(2)
    expect(screen.getByText('n/a')).toBeInTheDocument()
    expect(screen.getAllByText('Question')).toHaveLength(4)
    expect(screen.getByText('What is the budget?')).toBeInTheDocument()
    expect(screen.getAllByText('Response')).toHaveLength(4)
    expect(screen.queryByText('AI needs')).not.toBeInTheDocument()
  })

  it('omits the question block when no preceding user message exists', () => {
    render(
      <AIStatsPanel
        showRightPanel={false}
        resolveFileHref={() => null}
        messages={[assistantMessage({ id: 'assistant-only', text: 'Standalone answer' })] as never}
      />,
    )

    expect(screen.queryByText('Question')).not.toBeInTheDocument()
    expect(screen.getByText('Response')).toBeInTheDocument()
    expect(screen.getByText('Standalone answer')).toBeInTheDocument()
  })

  it('sorts top AI needs by count then alphabetically', () => {
    render(
      <AIStatsPanel
        showRightPanel={true}
        resolveFileHref={() => null}
        messages={[
          assistantMessage({ id: '1', improvementHint: 'Beta hint' }),
          assistantMessage({ id: '2', improvementHint: 'Alpha hint' }),
          assistantMessage({ id: '3', improvementHint: 'Beta hint' }),
          assistantMessage({ id: '4', improvementHint: 'Alpha hint' }),
          assistantMessage({ id: '5', improvementHint: 'Gamma hint', status: 'no_permitted_sources' }),
        ] as never}
      />,
    )

    const aside = screen.getByText('AI needs').closest('aside')
    expect(aside).not.toBeNull()
    const rows = Array.from((aside as HTMLElement).querySelectorAll('.ai-need-row .ai-need-row-copy span:last-child')).map((node) => node.textContent)
    expect(rows).toEqual(['Alpha hint', 'Beta hint', 'Gamma hint'])
    expect(within(aside as HTMLElement).getByRole('img', { name: /need distribution/i })).toBeInTheDocument()
  })

  it('shows the sources used for a response when details are visible', async () => {
    const user = userEvent.setup()
    render(
      <AIStatsPanel
        showRightPanel={false}
        resolveFileHref={() => 'https://example.test/source.json'}
        messages={[
          { id: 'user-1', role: 'user', text: 'Qui est Paul ?', status: 'answered' },
          assistantMessage({
            id: 'assistant-1',
            text: 'Paul Mondou est mentionne dans le corpus.',
            sources: [
              {
                id: 'source-1',
                title: 'e-plan HVAC Paul 260301',
                siteId: 'site-a',
                siteName: 'CSAS-OP-Prod',
                path: '/Docs/e-plan HVAC Paul 260301.json',
                updatedAt: '2026-03-24T12:33:48.922Z',
                author: 'Paul Mondou',
                score: 29,
                summary: 'HVAC prototype note',
                snippet: 'HVAC prototype note',
                tags: [],
                access: ['admin'],
                source: 'sharepoint',
              },
            ],
          }),
        ] as never}
      />,
    )

    expect(screen.getByText('Sources (1)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show sources' }))
    expect(screen.getByText('Sources (1)')).toBeInTheDocument()
    expect(screen.getByText('CSAS-OP-Prod')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /e-plan hvac paul 260301\.json/i })).toBeInTheDocument()
  })

  it('only shows provider badges when the response card is expanded', async () => {
    const user = userEvent.setup()
    render(
      <AIStatsPanel
        showRightPanel={false}
        resolveFileHref={() => null}
        messages={[
          { id: 'user-1', role: 'user', text: 'Who is Paul?', status: 'answered' },
          assistantMessage({ id: 'assistant-1', text: 'First answer' }),
        ] as never}
      />,
    )

    expect(screen.queryByLabelText('Response source metadata')).not.toBeInTheDocument()

    const responseCard = screen.getByRole('button', { name: /who is paul\?/i })
    await user.click(responseCard)

    const metadata = within(responseCard).getByLabelText('Response source metadata')
    expect(metadata).toBeVisible()
    expect(within(metadata).getByText('openai')).toBeInTheDocument()
    expect(within(metadata).getByText('remote')).toBeInTheDocument()
  })

  it('closes the previous response details when another card is opened', async () => {
    const user = userEvent.setup()
    render(
      <AIStatsPanel
        showRightPanel={false}
        resolveFileHref={() => null}
        messages={[
          { id: 'user-1', role: 'user', text: 'Who is Paul?', status: 'answered' },
          assistantMessage({ id: 'assistant-1', text: 'First answer', improvementHint: 'Need first hint' }),
          { id: 'user-2', role: 'user', text: 'Who is Romaric?', status: 'answered' },
          assistantMessage({ id: 'assistant-2', text: 'Second answer', improvementHint: 'Need second hint' }),
        ] as never}
      />,
    )

    const firstCard = screen.getByRole('button', { name: /who is paul\?/i })
    const secondCard = screen.getByRole('button', { name: /who is romaric\?/i })

    await user.click(firstCard)
    expect(firstCard).toHaveAttribute('aria-expanded', 'true')
    await user.click(within(firstCard).getByRole('button', { name: 'Show what would help next' }))
    expect(screen.getByText('Need first hint')).toBeInTheDocument()

    await user.click(secondCard)
    expect(firstCard).toHaveAttribute('aria-expanded', 'false')
    expect(secondCard).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByText('Need first hint')).not.toBeInTheDocument()
    await user.click(within(secondCard).getByRole('button', { name: 'Show what would help next' }))
    expect(screen.getByText('Need second hint')).toBeInTheDocument()
  })
})
