import { describe, expect, it } from 'vitest'
import { getMockCorpusBundle } from '../src/data/corpus'
import { buildBishopPrompt, groundQuestion } from '../src/lib/bishop'

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
})
