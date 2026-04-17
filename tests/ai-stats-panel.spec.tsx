import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AIStatsPanel } from '../src/components/panels/ai-stats-panel'
import type { AIUsageSummary } from '../src/lib/ai-usage'

function buildUsageSummary(overrides: Partial<AIUsageSummary> = {}): AIUsageSummary {
  return {
    events: [],
    providerEvents: [],
    todayInput: 0,
    todayOutput: 0,
    todayTotal: 0,
    answeredCount: 0,
    providerBreakdown: [],
    daily: [{ day: '2026-04-17', input: 0, output: 0, total: 0, count: 0 }],
    hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, input: 0, output: 0, total: 0, count: 0 })),
    ...overrides,
  }
}

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
  it('renders the answered section empty state', () => {
    render(
      <AIStatsPanel
        aiUsageSummary={buildUsageSummary()}
        messages={[{ id: 'seed', role: 'assistant', text: 'seed', status: 'draft', sources: [] } as never]}
        resolveFileHref={() => null}
        showRightPanel={true}
      />,
    )

    expect(screen.getByText('Ask Bishop a question to populate the response stats.')).toBeInTheDocument()
    expect(screen.getByText('No AI needs have been surfaced yet.')).toBeInTheDocument()
    expect(screen.getByText('Review recent answered responses or switch to token consumption rollups and provider usage.')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'AI View navigation' })).toBeInTheDocument()
  })

  it('switches to the tokens section and shows usage rollups', async () => {
    const user = userEvent.setup()
    render(
      <AIStatsPanel
        aiUsageSummary={buildUsageSummary({
          todayInput: 120,
          todayOutput: 45,
          todayTotal: 165,
          answeredCount: 3,
          providerBreakdown: [{ provider: 'openai', total: 165, input: 120, output: 45, count: 3 }],
          daily: [
            { day: '2026-04-16', input: 10, output: 12, total: 22, count: 1 },
            { day: '2026-04-17', input: 120, output: 45, total: 165, count: 3 },
          ],
          hourly: Array.from({ length: 24 }, (_, hour) => ({
            hour,
            input: hour === 10 ? 120 : 0,
            output: hour === 10 ? 45 : 0,
            total: hour === 10 ? 165 : 0,
            count: hour === 10 ? 3 : 0,
          })),
        })}
        messages={[assistantMessage()] as never}
        resolveFileHref={() => null}
        showRightPanel={true}
      />,
    )

    await user.click(screen.getByRole('button', { name: /tokens/i }))

    expect(screen.getByText('Today input')).toBeInTheDocument()
    expect(screen.getAllByText('165').length).toBeGreaterThan(0)
    expect(screen.getByText('Daily trend')).toBeInTheDocument()
    expect(screen.getByText('Hourly distribution')).toBeInTheDocument()
    expect(screen.getByText('Provider split')).toBeInTheDocument()
    expect(screen.getByText('openai')).toBeInTheDocument()
  })

  it('shows response details and sources in the answered section', async () => {
    const user = userEvent.setup()
    render(
      <AIStatsPanel
        aiUsageSummary={buildUsageSummary()}
        messages={[
          { id: 'user-1', role: 'user', text: 'Who is Paul?', status: 'answered', sources: [] },
          assistantMessage({
            id: 'assistant-1',
            text: 'Paul is mentioned in the corpus.',
            improvementHint: 'Need site name',
            sources: [
              {
                id: 'source-1',
                title: 'Doc 1',
                siteId: 'site-a',
                siteName: 'Site A',
                path: '/Docs/doc-1.json',
                updatedAt: '2026-03-24T12:33:48.922Z',
                author: 'Paul',
                score: 29,
                summary: 'Doc 1',
                snippet: 'Doc 1',
                tags: [],
                access: ['admin'],
                source: 'sharepoint',
              },
            ],
          }),
        ] as never}
        resolveFileHref={() => 'https://example.test/source.json'}
        showRightPanel={false}
      />,
    )

    const responseCard = screen.getByRole('button', { name: /who is paul\?/i })
    await user.click(responseCard)
    await user.click(screen.getByRole('button', { name: 'Show sources' }))
    await user.click(screen.getByRole('button', { name: 'Show what would help next' }))

    expect(screen.getByText('Site A')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /doc-1\.json/i })).toBeInTheDocument()
    expect(screen.getByText('Need site name')).toBeInTheDocument()
  })
})
