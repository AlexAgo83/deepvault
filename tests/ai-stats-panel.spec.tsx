import { render, screen, within } from '@testing-library/react'
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
    render(<AIStatsPanel messages={[{ id: 'seed', role: 'assistant', text: 'seed', status: 'draft' } as never]} showRightPanel={true} />)

    expect(screen.getByText('Ask Bishop a question to populate the response stats.')).toBeInTheDocument()
    expect(screen.getByText('No AI needs have been surfaced yet.')).toBeInTheDocument()
  })

  it('aggregates recurring AI needs and hides the right panel when requested', () => {
    render(
      <AIStatsPanel
        showRightPanel={false}
        messages={[
          assistantMessage({ id: '1', improvementHint: 'Need site name', text: 'one' }),
          assistantMessage({ id: '2', improvementHint: 'Need document title', text: 'two', confidenceScore: undefined }),
          assistantMessage({ id: '3', improvementHint: 'Need site name', text: 'three', status: 'no_answer' }),
          assistantMessage({ id: '4', improvementHint: 'Need site name', text: 'four', status: 'answering' }),
          assistantMessage({ id: '5', text: 'five', status: 'no_permitted_sources' }),
        ] as never}
      />,
    )

    expect(screen.getAllByText('Answered response')).toHaveLength(2)
    expect(screen.getAllByText('no_answer')).toHaveLength(2)
    expect(screen.getByText('n/a')).toBeInTheDocument()
    expect(screen.queryByText('AI needs')).not.toBeInTheDocument()
  })

  it('sorts top AI needs by count then alphabetically', () => {
    render(
      <AIStatsPanel
        showRightPanel={true}
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
    const rows = within(aside as HTMLElement).getAllByText(/hint$/).map((node) => node.textContent)
    expect(rows).toEqual(['Alpha hint', 'Beta hint', 'Gamma hint'])
  })
})
