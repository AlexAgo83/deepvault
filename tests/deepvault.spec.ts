import { describe, expect, it } from 'vitest'
import { getMockCorpusBundle } from '../src/data/corpus'
import {
  answerQuestion,
  buildEvaluationRows,
  buildExplorerRows,
  buildSharePointFileUrl,
  buildSiteSummaries,
  buildSyncOverview,
  formatUpdatedAt,
  groundQuestion,
  searchDocuments,
  resolveSharePointFileUrl,
  type Corpus,
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
    expect(overview.lastRun?.id).toBe('sync-2026-04-10-01')
    expect(overview.lastRun?.notes).toContain('permission-aware filtering')
  })

  it('scopes sync overview counts by role', () => {
    const guestOverview = buildSyncOverview(corpus, 'guest')
    const adminOverview = buildSyncOverview(corpus, 'admin')

    expect(guestOverview.documentCount).toBe(0)
    expect(guestOverview.chunkCount).toBe(0)
    expect(guestOverview.syncedSites).toBe(2)
    expect(guestOverview.restrictedSites).toBe(1)

    expect(adminOverview.documentCount).toBe(18)
    expect(adminOverview.chunkCount).toBe(108)
    expect(adminOverview.syncedSites).toBe(2)
    expect(adminOverview.restrictedSites).toBe(1)
  })

  it('builds site summaries with permission-aware counts', () => {
    const siteSummaries = buildSiteSummaries(corpus, 'guest')

    expect(siteSummaries).toHaveLength(3)
    expect(siteSummaries.find((site) => site.id === 'restricted-pilot')).toMatchObject({
      status: 'restricted',
      permittedDocumentCount: 0,
    })
  })

  it('marks a site without sync history as pending', () => {
    const syntheticCorpus: Corpus = {
      ...corpus,
      sites: [
        ...corpus.sites,
        {
          id: 'no-sync-site',
          name: 'No Sync Site',
          url: 'https://example.sharepoint.com/sites/no-sync',
          libraryCount: 1,
          listCount: 0,
          status: 'pending' as const,
          access: ['analyst', 'admin'] as const,
          owner: 'Ops',
        },
      ],
    }

    const siteSummaries = buildSiteSummaries(syntheticCorpus, 'analyst')

    expect(siteSummaries.find((site) => site.id === 'no-sync-site')).toMatchObject({
      lastRefresh: null,
      lastRefreshStatus: 'pending',
      documentCount: 0,
      permittedDocumentCount: 0,
    })
  })

  it('returns denied sources when a role cannot access relevant content', () => {
    const result = answerQuestion(corpus, 'What are the restricted launch notes for the restricted pilot site?', {
      role: 'guest',
      provider: 'openai',
    })

    expect(result.status).toBe('no_permitted_sources')
    expect(result.deniedSources).not.toHaveLength(0)
  })

  it('returns no answer for inventory style SharePoint questions', () => {
    const result = answerQuestion(corpus, 'What SharePoint sites are available for the Finance team?', {
      role: 'analyst',
      provider: 'openai',
    })

    expect(result.status).toBe('no_answer')
    expect(result.sources).toHaveLength(0)
  })

  it('returns grounded answers when the query matches document content', () => {
    const result = answerQuestion(corpus, 'What is the budget for Q3 2025?', {
      role: 'analyst',
      provider: 'openai',
    })

    expect(result.status).toBe('answered')
    expect(result.sources).not.toHaveLength(0)
    expect(result.answer).toContain('Q3 2025 budget')
  })

  it('ranks the strongest explorer match first and keeps the site filter scoped', () => {
    const explorerRows = buildExplorerRows(corpus, 'q3 2025 budget', { role: 'analyst', siteId: 'pilot-alpha' })

    expect(explorerRows[0].id).toBe('q3-budget')
    expect(explorerRows.some((row) => row.id === 'q3-budget')).toBe(true)
    expect(explorerRows.every((row) => row.siteId === 'pilot-alpha')).toBe(true)
    expect(explorerRows.every((row) => row.siteName === 'Pilot Site Alpha')).toBe(true)

    const rankedMatches = searchDocuments(corpus, 'q3 2025 budget', { role: 'analyst' })
    expect(rankedMatches[0].document.id).toBe('q3-budget')
    expect(rankedMatches[0].score).toBeGreaterThan(0)
  })

  it('keeps denied sources out of explorer rows for restricted content', () => {
    const explorerRows = buildExplorerRows(corpus, 'restricted launch notes', { role: 'guest' })

    expect(explorerRows).toHaveLength(0)
    expect(searchDocuments(corpus, 'restricted launch notes', { role: 'guest', includeDenied: true })[0].permitted).toBe(false)
  })

  it('filters search results by site and respects the result limit', () => {
    const alphaResults = searchDocuments(corpus, 'project', { role: 'analyst', siteId: 'pilot-alpha', limit: 2 })
    const betaResults = searchDocuments(corpus, 'policy', { role: 'analyst', siteId: 'pilot-beta', limit: 2 })

    expect(alphaResults).toHaveLength(2)
    expect(betaResults).toHaveLength(2)
    expect(alphaResults.every((entry) => entry.document.siteId === 'pilot-alpha')).toBe(true)
    expect(betaResults.every((entry) => entry.document.siteId === 'pilot-beta')).toBe(true)
    expect(alphaResults[0].score).toBeGreaterThanOrEqual(alphaResults[1].score)
    expect(betaResults[0].score).toBeGreaterThanOrEqual(betaResults[1].score)
  })

  it('scores title matches ahead of broader content matches', () => {
    const rankedMatches = searchDocuments(corpus, 'q3 2025 budget approval', { role: 'analyst', limit: 3 })

    expect(rankedMatches[0].document.id).toBe('q3-budget')
    expect(rankedMatches[0].score).toBeGreaterThan(rankedMatches[1].score)
    expect(rankedMatches.every((entry) => entry.permitted)).toBe(true)
  })

  it('summarizes the corpus and formats timestamps', () => {
    const summary = summarizeCorpus(corpus, 'analyst')

    expect(summary.sourcesIndexed).toBe(18)
    expect(summary.visibleSources).toBe(17)
    expect(summary.deniedSources).toBe(1)
    expect(formatUpdatedAt('2025-06-12T10:00:00Z')).toContain('2025')
  })

  it('scopes corpus summary counts by role', () => {
    const guestSummary = summarizeCorpus(corpus, 'guest')
    const adminSummary = summarizeCorpus(corpus, 'admin')

    expect(guestSummary.sourcesIndexed).toBe(18)
    expect(guestSummary.visibleSources).toBe(0)
    expect(guestSummary.deniedSources).toBe(18)

    expect(adminSummary.visibleSources).toBe(18)
    expect(adminSummary.deniedSources).toBe(0)
  })

  it('prefers the native webUrl and falls back to a safe SharePoint path', () => {
    const liveCorpus: Corpus = {
      ...corpus,
      sites: [
        {
          id: 'site-a',
          name: 'Site A',
          url: 'https://example.sharepoint.com/sites/site-a',
          libraryCount: 1,
          listCount: 0,
          status: 'synced' as const,
          access: ['analyst', 'admin'] as const,
          owner: 'Ops',
        },
      ],
    }

    expect(
      resolveSharePointFileUrl(liveCorpus, 'site-a', '/Documents/Folder/File.docx', 'https://example.sharepoint.com/sites/site-a/shared/file.docx'),
    ).toBe('https://example.sharepoint.com/sites/site-a/shared/file.docx')
    expect(buildSharePointFileUrl('https://example.sharepoint.com/sites/site-a', '/Documents/Folder/File.docx')).toBe(
      'https://example.sharepoint.com/sites/site-a/Shared%20Documents/Folder/File.docx',
    )
    expect(resolveSharePointFileUrl(liveCorpus, 'site-a', '/Documents/Folder/File.docx')).toBe(
      'https://example.sharepoint.com/sites/site-a/Shared%20Documents/Folder/File.docx',
    )
  })

  it('corpus has schemaVersion 1.1 and all documents carry fileType and sections', () => {
    expect(corpus.schemaVersion).toBe('1.1')

    for (const document of corpus.documents) {
      expect(document.fileType).toBeDefined()
      expect(typeof document.fileType).toBe('string')
      expect(Array.isArray(document.sections)).toBe(true)
      expect((document.sections ?? []).length).toBeGreaterThan(0)
    }
  })

  it('section headings are non-empty strings', () => {
    for (const document of corpus.documents) {
      for (const section of document.sections ?? []) {
        expect(typeof section.heading).toBe('string')
        expect(section.heading.trim().length).toBeGreaterThan(0)
        expect(typeof section.content).toBe('string')
        expect(section.content.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('groundQuestion returns a sectionHint when a query matches a section heading', () => {
    const result = groundQuestion(corpus, 'operating reserve', { role: 'analyst' })

    expect(result.status).toBe('answered')
    const topSource = result.sources[0]
    expect(topSource.sectionHint).toBeDefined()
    expect(topSource.sectionHint).toContain('Operating Reserve')
  })

  it('groundQuestion returns fileType on sources when set', () => {
    const result = groundQuestion(corpus, 'risk register spreadsheet', { role: 'analyst' })

    expect(result.status).toBe('answered')
    const riskSource = result.sources.find((source) => source.id === 'alpha-risk-register')
    expect(riskSource?.fileType).toBe('spreadsheet')
  })

  it('ranks documents with section heading match higher than flat content match for the same query', () => {
    // "Operating Reserve" is a section heading in q3-budget but does not appear in any title
    const results = searchDocuments(corpus, 'operating reserve', { role: 'analyst' })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].document.id).toBe('q3-budget')
  })
})
