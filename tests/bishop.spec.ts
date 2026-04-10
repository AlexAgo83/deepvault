import { describe, expect, it, vi } from 'vitest'
import { getMockCorpusBundle } from '../src/data/corpus'
import { buildBishopPrompt, groundQuestion, orchestrateBishopAnswer } from '../src/lib/bishop'

const corpus = getMockCorpusBundle().corpus

describe('bishop orchestration helpers', () => {
  it('grounds inventory style questions before any LLM call', () => {
    const grounding = groundQuestion(corpus, 'What SharePoint sites are available for the Finance team?', {
      role: 'analyst',
      provider: 'openai',
    })

    expect(grounding.status).toBe('no_answer')
    expect(grounding.sources).toHaveLength(0)
    expect(grounding.localAnswer).toContain('SharePoint site inventory')
  })

  it('builds a grounded prompt from permitted sources', () => {
    const grounding = groundQuestion(corpus, 'What is the budget for Q3 2025?', {
      role: 'analyst',
      provider: 'openai',
    })

    const prompt = buildBishopPrompt({
      query: 'What is the budget for Q3 2025?',
      role: 'analyst',
      provider: 'openai',
      grounding,
    })

    expect(grounding.status).toBe('answered')
    expect(grounding.sources).not.toHaveLength(0)
    expect(prompt).toContain('Use only the grounded context below.')
    expect(prompt).toContain('Sources:')
    expect(prompt).toContain('Q3 2025 budget')
  })

  it('keeps denied sources visible in the grounding contract', () => {
    const grounding = groundQuestion(corpus, 'What are the restricted launch notes for the restricted pilot site?', {
      role: 'guest',
      provider: 'openai',
    })

    expect(grounding.status).toBe('no_permitted_sources')
    expect(grounding.deniedSources).not.toHaveLength(0)
    expect(grounding.localAnswer).toContain('current role cannot access')
  })

  it('falls back locally when no remote endpoint is configured', async () => {
    const result = await orchestrateBishopAnswer(corpus, 'What is the budget for Q3 2025?', {
      role: 'analyst',
      provider: 'openai',
    })

    expect(result.mode).toBe('fallback')
    expect(result.answer).toContain('Q3 2025 budget')
  })

  it('uses a remote orchestration endpoint when it is available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: 'Remote answer from Bishop orchestration.',
        chunkCount: 42,
        tokenCount: 420,
        latencyMs: 84,
      }),
    })

    const result = await orchestrateBishopAnswer(corpus, 'What is the budget for Q3 2025?', {
      role: 'analyst',
      provider: 'openai',
      endpoint: 'https://example.test/bishop',
      fetchImpl: fetchMock as typeof fetch,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.mode).toBe('remote')
    expect(result.answer).toBe('Remote answer from Bishop orchestration.')
    expect(result.chunkCount).toBe(42)
    expect(result.tokenCount).toBe(420)
    expect(result.latencyMs).toBe(84)
  })
})
