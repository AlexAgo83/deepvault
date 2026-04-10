import { describe, expect, it } from 'vitest'
import { getMockCorpusBundle } from '../src/data/corpus'
import {
  answerQuestion,
  buildEvaluationRows,
  buildSiteSummaries,
  buildSyncOverview,
  formatUpdatedAt,
  summarizeCorpus,
} from '../src/lib/deepvault'

const corpus = getMockCorpusBundle().corpus

describe('deepvault helpers', () => {
  it('builds the expected evaluation matrix', () => {
    const rows = buildEvaluationRows()

    expect(rows).toHaveLength(20)
    expect(rows[0]).toMatchObject({ id: 'Q01', expectedStatus: 'answered' })
    expect(rows.find((row) => row.id === 'Q19')).toMatchObject({
      role: 'guest',
      expectedStatus: 'no_permitted_sources',
    })
  })

  it('summarizes corpus visibility and sync state', () => {
    const overview = buildSyncOverview(corpus, 'analyst')

    expect(overview.documentCount).toBe(17)
    expect(overview.chunkCount).toBe(102)
    expect(overview.syncedSites).toBe(2)
    expect(overview.restrictedSites).toBe(1)
    expect(overview.lastRun?.status).toBe('synced')
  })

  it('builds site summaries with permission-aware counts', () => {
    const siteSummaries = buildSiteSummaries(corpus, 'guest')

    expect(siteSummaries).toHaveLength(3)
    expect(siteSummaries.find((site) => site.id === 'stealth-lab')).toMatchObject({
      status: 'restricted',
      permittedDocumentCount: 0,
    })
  })

  it('returns denied sources when a role cannot access relevant content', () => {
    const result = answerQuestion(corpus, 'What are the restricted launch notes for the stealth lab?', {
      role: 'guest',
      provider: 'openai',
    })

    expect(result.status).toBe('no_permitted_sources')
    expect(result.deniedSources).not.toHaveLength(0)
  })

  it('summarizes the corpus and formats timestamps', () => {
    const summary = summarizeCorpus(corpus, 'analyst')

    expect(summary.sourcesIndexed).toBe(18)
    expect(summary.visibleSources).toBe(17)
    expect(summary.deniedSources).toBe(1)
    expect(formatUpdatedAt('2025-06-12T10:00:00Z')).toContain('2025')
  })
})
