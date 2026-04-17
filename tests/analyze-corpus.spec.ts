import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMockCorpusBundle } from '../src/data/corpus'
import type { Corpus, CorpusDocument } from '../src/lib/deepvault'
import { analyzeCorpusDocuments, buildAnalysisRunReport } from '../scripts/analyze-corpus'

function makeDoc(overrides: Partial<CorpusDocument> & Pick<CorpusDocument, 'id' | 'path'>): CorpusDocument {
  return {
    siteId: 'site-test',
    kind: 'document',
    title: `Test Document ${overrides.id}`,
    author: 'test',
    updatedAt: '2026-01-01T00:00:00Z',
    summary: 'A test document summary that is long enough to pass extraction checks.',
    directAnswer: '',
    content: 'This is test document content that is long enough to meet the minimum content threshold of two hundred and eighty characters required by the selectCandidateReason function, ensuring that documents with other quality signals like missing sections are correctly classified without being short-circuited by the weak extraction check.',
    tags: [],
    access: ['all'],
    source: 'test',
    ...overrides,
  }
}

function makeCorpus(documents: CorpusDocument[]): Corpus {
  return {
    defaultUserRole: 'analyst',
    providers: [],
    sites: [],
    syncRuns: [],
    documents,
  }
}

describe('analyze corpus script helpers', () => {
  it('builds additive analysis blocks and bounded metrics', async () => {
    const corpus = getMockCorpusBundle().corpus

    const result = await analyzeCorpusDocuments(corpus, {
      mode: 'necessary',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      limit: 3,
    })

    expect(result.metrics.scanned).toBe(corpus.documents.length)
    expect(result.metrics.selected).toBeGreaterThanOrEqual(result.metrics.analyzed)
    expect(result.metrics.analyzed).toBeLessThanOrEqual(3)
    expect(result.metrics.failed).toBe(0)
    expect(result.documents.some((document) => document.analysis?.status === 'analyzed')).toBe(true)
    expect(
      result.documents.some(
        (document) => document.analysis?.status === 'excluded' || document.analysis?.status === 'stale',
      ),
    ).toBe(true)
  })

  it('builds an analysis run report from metrics', () => {
    const report = buildAnalysisRunReport({
      corpusMode: 'mock',
      corpusPath: '/tmp/input.json',
      outputPath: '/tmp/output.json',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      selectionMode: 'necessary',
      limit: 12,
      metrics: {
        scanned: 10,
        selected: 6,
        analyzed: 4,
        failed: 1,
        excluded: 5,
        reused: 1,
        stale: 2,
        exclusionReasons: { insufficient_expected_value: 5 },
        selectionReasons: { priority_file_type: 4 },
        actualInputTokens: 0,
        actualOutputTokens: 0,
        providerAttempts: 0,
        providerSuccesses: 0,
        providerFallbacks: 0,
        providerFailureReasons: {},
      },
    })

    expect(report.schemaVersion).toBe('1.0')
    expect(report.selectionMode).toBe('necessary')
    expect(report.selected).toBe(6)
    expect(report.failed).toBe(1)
    expect(report.exclusionReasons.insufficient_expected_value).toBe(5)
    expect(report.selectionReasons.priority_file_type).toBe(4)
    expect(report.estimatedInputTokens).toBe(3600)
    expect(report.estimatedOutputTokens).toBe(880)
    expect(report.estimatedCostUsd).toBeGreaterThan(0)
    expect(report.actualInputTokens).toBe(0)
    expect(report.actualOutputTokens).toBe(0)
    expect(report.tokenCountMode).toBe('estimated')
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('analyze corpus Wave 4 — difficult-file validation', () => {
  const BASE_OPTS = { provider: 'local', model: 'heuristic-v1', limit: 20 } as const

  it('excludes binary-extension files with unsupported_file_type', async () => {
    const corpus = makeCorpus([
      makeDoc({ id: 'bin-1', path: 'files/archive.zip' }),
      makeDoc({ id: 'bin-2', path: 'files/installer.exe' }),
      makeDoc({ id: 'bin-3', path: 'media/clip.mp4' }),
      makeDoc({ id: 'img-1', path: 'assets/logo.png' }),
    ])

    const result = await analyzeCorpusDocuments(corpus, { ...BASE_OPTS, mode: 'all' })

    expect(result.metrics.excluded).toBe(4)
    expect(result.metrics.analyzed).toBe(0)
    expect(result.documents.every((doc) => doc.analysis?.status === 'excluded')).toBe(true)
    expect(result.documents.every((doc) => doc.analysis?.excludedReason === 'unsupported_file_type')).toBe(true)
  })

  it('excludes documents with empty content and summary with unreadable_content', async () => {
    const corpus = makeCorpus([
      makeDoc({ id: 'empty-1', path: 'doc-a.md', summary: '', content: '' }),
      makeDoc({ id: 'empty-2', path: 'doc-b.md', summary: '   ', content: '   ' }),
    ])

    const result = await analyzeCorpusDocuments(corpus, { ...BASE_OPTS, mode: 'all' })

    expect(result.metrics.excluded).toBe(2)
    expect(result.documents.every((doc) => doc.analysis?.excludedReason === 'unreadable_content')).toBe(true)
  })

  it('excludes oversized files with file_too_large', async () => {
    const largeContent = 'x'.repeat(18001)
    const corpus = makeCorpus([
      makeDoc({ id: 'large-1', path: 'big.md', content: largeContent }),
    ])

    const result = await analyzeCorpusDocuments(corpus, { ...BASE_OPTS, mode: 'all' })

    expect(result.metrics.excluded).toBe(1)
    expect(result.documents[0]?.analysis?.excludedReason).toBe('file_too_large')
  })

  it('selects weak-extraction candidates in necessary mode (missing summary or short content)', async () => {
    const corpus = makeCorpus([
      makeDoc({ id: 'weak-1', path: 'note.md', summary: '', content: 'Short.' }),
      makeDoc({ id: 'weak-2', path: 'stub.md', summary: '  ', content: 'A small stub with less than 280 characters total.' }),
    ])

    const result = await analyzeCorpusDocuments(corpus, { ...BASE_OPTS, mode: 'necessary' })

    expect(result.metrics.analyzed).toBe(2)
    expect(result.metrics.selectionReasons.weak_local_extraction).toBe(2)
  })

  it('selects priority file types (pdf, document, presentation) in necessary mode', async () => {
    const corpus = makeCorpus([
      makeDoc({ id: 'pdf-1', path: 'report.pdf', fileType: 'pdf' }),
      makeDoc({ id: 'doc-1', path: 'policy.docx', fileType: 'document' }),
      makeDoc({ id: 'ppt-1', path: 'deck.pptx', fileType: 'presentation' }),
    ])

    const result = await analyzeCorpusDocuments(corpus, { ...BASE_OPTS, mode: 'necessary' })

    expect(result.metrics.analyzed).toBe(3)
    expect(result.metrics.selectionReasons.priority_file_type).toBe(3)
  })

  it('selects documents with empty sections array in necessary mode', async () => {
    const corpus = makeCorpus([
      makeDoc({ id: 'nosec-1', path: 'page.md', sections: [] }),
    ])

    const result = await analyzeCorpusDocuments(corpus, { ...BASE_OPTS, mode: 'necessary' })

    expect(result.metrics.analyzed).toBe(1)
    expect(result.metrics.selectionReasons.missing_structure).toBe(1)
  })

  it('caps analyzed at the run budget and marks remaining candidates as stale', async () => {
    const docs = Array.from({ length: 6 }, (_, index) =>
      makeDoc({ id: `batch-${index}`, path: `doc-${index}.pdf`, fileType: 'pdf' }),
    )
    const corpus = makeCorpus(docs)

    const result = await analyzeCorpusDocuments(corpus, { ...BASE_OPTS, mode: 'all', limit: 3 })

    expect(result.metrics.analyzed).toBe(3)
    expect(result.metrics.stale).toBe(3)
    expect(result.metrics.selected).toBe(6)
  })

  it('reuses existing valid analysis across runs without re-analyzing', async () => {
    const corpus = makeCorpus([
      makeDoc({ id: 'reuse-1', path: 'a.pdf', fileType: 'pdf' }),
      makeDoc({ id: 'reuse-2', path: 'b.pdf', fileType: 'pdf' }),
    ])

    const firstRun = await analyzeCorpusDocuments(corpus, { ...BASE_OPTS, mode: 'all', limit: 10 })
    const analyzedCorpus = makeCorpus(firstRun.documents)
    const secondRun = await analyzeCorpusDocuments(analyzedCorpus, { ...BASE_OPTS, mode: 'all', limit: 10 })

    expect(secondRun.metrics.reused).toBe(2)
    expect(secondRun.metrics.analyzed).toBe(0)
  })

  it('reports tokenCountMode as estimated when no actual provider tokens are accumulated', async () => {
    const corpus = makeCorpus([makeDoc({ id: 'tok-1', path: 'a.pdf', fileType: 'pdf' })])

    const result = await analyzeCorpusDocuments(corpus, { ...BASE_OPTS, mode: 'all' })
    const report = buildAnalysisRunReport({
      corpusMode: 'test',
      corpusPath: '/tmp/in.json',
      outputPath: '/tmp/out.json',
      provider: 'local',
      model: 'heuristic-v1',
      selectionMode: 'all',
      limit: 20,
      metrics: result.metrics,
    })

    expect(report.actualInputTokens).toBe(0)
    expect(report.actualOutputTokens).toBe(0)
    expect(report.tokenCountMode).toBe('estimated')
    expect(report.estimatedInputTokens).toBeGreaterThan(0)
  })

  it('emits progress snapshots while analyzing documents', async () => {
    const snapshots: Array<{ analyzed: number; elapsedMs: number; selected: number }> = []
    const corpus = makeCorpus([
      makeDoc({ id: 'prog-1', path: 'a.pdf', fileType: 'pdf' }),
      makeDoc({ id: 'prog-2', path: 'b.pdf', fileType: 'pdf' }),
    ])

    const result = await analyzeCorpusDocuments(corpus, {
      mode: 'all',
      provider: 'local',
      model: 'heuristic-v1',
      limit: 5,
      onProgress: (snapshot) => {
        snapshots.push({
          analyzed: snapshot.analyzed,
          elapsedMs: snapshot.elapsedMs,
          selected: snapshot.selected,
        })
      },
    })

    expect(result.metrics.analyzed).toBe(2)
    expect(snapshots.length).toBeGreaterThan(0)
    expect(snapshots.at(-1)).toEqual(expect.objectContaining({ analyzed: 2, selected: 2 }))
    expect(snapshots.every((snapshot) => snapshot.elapsedMs >= 0)).toBe(true)
  })

  it('marks provider-backed analysis as a real provider success and records actual tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          summary: 'Provider summary',
          keywords: ['provider', 'analysis'],
          sections: [{ heading: 'Overview', content: 'Provider generated section.' }],
          documentType: 'report',
          confidence: 88,
        }),
        usage: {
          input_tokens: 123,
          output_tokens: 45,
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const corpus = makeCorpus([makeDoc({ id: 'prov-1', path: 'provider.pdf', fileType: 'pdf' })])
    const result = await analyzeCorpusDocuments(corpus, {
      mode: 'all',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      limit: 5,
      apiKey: 'sk-test',
    })
    const analysis = result.documents[0]?.analysis

    expect(analysis?.provider).toBe('openai')
    expect(analysis?.requestedProvider).toBe('openai')
    expect(analysis?.providerStatus).toBe('provider')
    expect(analysis?.model).toBe('gpt-5.4-mini')
    expect(analysis?.requestedModel).toBe('gpt-5.4-mini')
    expect(analysis?.fallbackReason).toBeUndefined()
    expect(result.metrics.actualInputTokens).toBe(123)
    expect(result.metrics.actualOutputTokens).toBe(45)
    expect(result.metrics.providerAttempts).toBe(1)
    expect(result.metrics.providerSuccesses).toBe(1)
    expect(result.metrics.providerFallbacks).toBe(0)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer sk-test' }),
      }),
    )
  })

  it('falls back to local analysis with an explicit reason when the provider response is unusable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          code: 'rate_limit_exceeded',
          type: 'request_error',
          message: 'Too many requests',
        },
      }),
    }))

    const corpus = makeCorpus([makeDoc({ id: 'fb-1', path: 'fallback.pdf', fileType: 'pdf' })])
    const result = await analyzeCorpusDocuments(corpus, {
      mode: 'all',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      limit: 5,
      apiKey: 'sk-test',
    })
    const analysis = result.documents[0]?.analysis
    const report = buildAnalysisRunReport({
      corpusMode: 'test',
      corpusPath: '/tmp/in.json',
      outputPath: '/tmp/out.json',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      selectionMode: 'all',
      limit: 5,
      metrics: result.metrics,
    })

    expect(analysis?.provider).toBe('local')
    expect(analysis?.requestedProvider).toBe('openai')
    expect(analysis?.model).toBe('heuristic-v1')
    expect(analysis?.requestedModel).toBe('gpt-5.4-mini')
    expect(analysis?.providerStatus).toBe('fallback')
    expect(analysis?.fallbackReason).toBe('http_429:rate_limit_exceeded|request_error|Too many requests')
    expect(result.metrics.actualInputTokens).toBe(0)
    expect(result.metrics.actualOutputTokens).toBe(0)
    expect(result.metrics.providerAttempts).toBe(1)
    expect(result.metrics.providerSuccesses).toBe(0)
    expect(result.metrics.providerFallbacks).toBe(1)
    expect(result.metrics.providerFailureReasons['http_429:rate_limit_exceeded|request_error|Too many requests']).toBe(1)
    expect(report.providerFallbacks).toBe(1)
    expect(report.providerFailureReasons['http_429:rate_limit_exceeded|request_error|Too many requests']).toBe(1)
    expect(report.tokenCountMode).toBe('estimated')
    expect(warn).toHaveBeenCalledWith(
      'Provider fallback for fallback.pdf: requested openai/gpt-5.4-mini, using local heuristic (http_429:rate_limit_exceeded|request_error|Too many requests).',
    )
  })
})
