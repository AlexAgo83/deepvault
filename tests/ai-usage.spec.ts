import { describe, expect, it } from 'vitest'
import { summarizeAIUsageEvents, type AIUsageEvent } from '../src/lib/ai-usage'

describe('ai-usage', () => {
  it('uses stable YYYY-MM-DD day keys across platforms', () => {
    const events: AIUsageEvent[] = [
      {
        id: 'event-1',
        source: 'analyze',
        sourceEventId: 'analyze-1',
        provider: 'openai',
        model: 'gpt-5.4-mini',
        status: 'analyze_completed',
        usageKind: 'provider',
        timestamp: '2026-04-17T10:15:00.000Z',
        inputTokenCount: 120,
        outputTokenCount: 45,
        totalTokenCount: 165,
      },
    ]

    const summary = summarizeAIUsageEvents(events, {
      now: new Date('2026-04-17T12:00:00.000Z'),
      historyDays: 2,
    })

    expect(summary.daily).toEqual([
      { day: '2026-04-16', input: 0, output: 0, total: 0, count: 0 },
      { day: '2026-04-17', input: 120, output: 45, total: 165, count: 1 },
    ])
    expect(summary.todayInput).toBe(120)
    expect(summary.todayOutput).toBe(45)
    expect(summary.todayTotal).toBe(165)
  })
})
