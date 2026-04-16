export { buildEvaluationRows, formatUpdatedAt } from './deepvault-evaluation'
import { getDocumentScore, normalizeText, tokenize } from './scoring'

export { getDocumentScore, normalizeText, tokenize }

export type UserRole = 'analyst' | 'admin' | 'guest'
export type ProviderId = 'openai' | 'gemini' | 'anthropic'

export interface ProviderRecord {
  id: ProviderId
  name: string
  ready: boolean
}

export interface SiteRecord {
  id: string
  name: string
  url: string
  libraryCount: number
  listCount: number
  status: 'synced' | 'restricted' | 'pending' | 'sync_failed'
  access: (UserRole | 'all')[]
  owner: string
}

export interface SyncRun {
  id: string
  startedAt: string
  finishedAt: string
  scope: string
  status: 'synced' | 'restricted' | 'pending' | 'sync_failed'
  siteIds: string[]
  documentsSynced: number
  chunksWritten: number
  notes: string
}

export interface CorpusSection {
  heading: string
  content: string
}

export interface CorpusDocument {
  id: string
  siteId: string
  kind: string
  title: string
  path: string
  webUrl?: string
  author: string
  createdBy?: string
  lastModifiedBy?: string
  updatedAt: string
  summary: string
  directAnswer: string
  content: string
  tags: string[]
  access: (UserRole | 'all')[]
  source: string
  /** Structured section breakdown for section-aware retrieval and chunk traceability. */
  sections?: CorpusSection[]
  /** Explicit file type derived from the source path extension (e.g. "document", "spreadsheet", "markdown"). */
  fileType?: string
}

export interface Corpus {
  schemaVersion?: string
  defaultUserRole: UserRole
  providers: ProviderRecord[]
  sites: SiteRecord[]
  syncRuns: SyncRun[]
  documents: CorpusDocument[]
}

export interface SourceRecord {
  id: string
  title: string
  siteId: string
  siteName: string
  path: string
  webUrl?: string
  updatedAt: string
  author: string
  createdBy?: string
  lastModifiedBy?: string
  score: number
  summary: string
  tags: string[]
  access: (UserRole | 'all')[]
  snippet: string
  source: string
  /** Section heading from which the relevant chunk was drawn, when sections are available. */
  sectionHint?: string
  /** Explicit file type from the source document (e.g. "document", "spreadsheet", "markdown"). */
  fileType?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  status: string
  sources: SourceRecord[]
  createdAt?: string
  provider?: ProviderId
  orchestrationMode?: 'remote' | 'fallback' | 'grounded-only'
  chunkCount?: number
  tokenCount?: number
  latencyMs?: number
  confidenceScore?: number
  providerTracePreview?: string
  improvementHint?: string
}

export interface EvaluationRow {
  id: string
  query: string
  expectedSourceId: string | null
  role: UserRole
  expectedStatus: 'answered' | 'no_answer' | 'no_permitted_sources'
}

export interface SiteSummary extends SiteRecord {
  documentCount: number
  permittedDocumentCount: number
  chunkCount: number
  lastRefresh: string | null
  lastRefreshStatus: SiteRecord['status']
}

export interface SyncOverview {
  siteSummaries: SiteSummary[]
  documentCount: number
  chunkCount: number
  syncedSites: number
  restrictedSites: number
  providerReadiness: ProviderRecord[]
  lastRun: SyncRun | undefined
  refreshPolicy: string
}

export interface AnswerResult {
  status: 'answered' | 'no_answer' | 'no_permitted_sources'
  provider: ProviderId
  query: string
  answer: string
  sources: SourceRecord[]
  deniedSources: SourceRecord[]
  chunkCount: number
  tokenCount: number
  latencyMs: number
}

export interface GroundingResult {
  status: AnswerResult['status']
  provider: ProviderId
  query: string
  sources: SourceRecord[]
  deniedSources: SourceRecord[]
  chunkCount: number
  tokenCount: number
  latencyMs: number
  localAnswer: string
  primaryDocumentId: string | null
}

export function canAccessDocument(document: Pick<CorpusDocument, 'access'>, role: UserRole): boolean {
  return document.access.includes(role) || document.access.includes('all')
}

export function getSiteById(corpusData: Corpus, siteId: string): SiteRecord | undefined {
  return corpusData.sites.find((site) => site.id === siteId)
}

export function buildSharePointFileUrl(siteUrl: string, path: string): string {
  const url = new URL(siteUrl)
  const sitePath = url.pathname.replace(/\/$/, '')
  const segments = path
    .split('/')
    .filter(Boolean)
  if (segments[0] === 'Documents') {
    segments[0] = 'Shared Documents'
  }
  const encodedPath = segments
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  url.pathname = `${sitePath}/${encodedPath}`.replace(/\/+/g, '/')
  return url.toString()
}

export function resolveSharePointFileUrl(
  corpusData: Corpus,
  siteId: string,
  path: string,
  webUrl?: string | null,
): string | null {
  if (webUrl) {
    return webUrl
  }

  const site = getSiteById(corpusData, siteId)
  if (!site?.url) {
    return null
  }
  return buildSharePointFileUrl(site.url, path)
}

export function searchDocuments(
  corpusData: Corpus,
  query: string,
  options: { role?: UserRole; siteId?: string; limit?: number; includeDenied?: boolean } = {},
): Array<{ document: CorpusDocument; score: number; permitted: boolean }> {
  const role = options.role || 'analyst'
  const siteId = options.siteId || 'all'
  const limit = options.limit || 50
  const includeDenied = Boolean(options.includeDenied)
  const trimmedQuery = query.trim()
  const queryTokens = tokenize(query)

  if (trimmedQuery.length === 0) {
    return corpusData.documents
      .filter((document) => siteId === 'all' || document.siteId === siteId)
      .map((document) => ({
        document,
        score: 1,
        permitted: canAccessDocument(document, role),
      }))
      .filter((entry) => includeDenied || entry.permitted)
      .sort((left, right) => new Date(right.document.updatedAt).getTime() - new Date(left.document.updatedAt).getTime())
      .slice(0, limit)
  }

  if (queryTokens.length === 0) {
    return []
  }

  const scored = corpusData.documents
    .filter((document) => siteId === 'all' || document.siteId === siteId)
    .map((document) => ({
      document,
      score: getDocumentScore(document, query),
      permitted: canAccessDocument(document, role),
    }))
    .filter((entry) => {
      const minimumScore = queryTokens.length > 1 ? 8 : 4
      return entry.score >= minimumScore && (includeDenied || entry.permitted)
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      return new Date(right.document.updatedAt).getTime() - new Date(left.document.updatedAt).getTime()
    })

  return scored.slice(0, limit)
}

function summarizeSentence(document: CorpusDocument, query: string): string {
  if (document.directAnswer) {
    return document.directAnswer
  }
  const tokens = tokenize(query)
  // Prefer section-level match when sections are available
  if (document.sections && document.sections.length > 0) {
    const matched = document.sections.find((section) =>
      tokens.some(
        (token) =>
          normalizeText(section.heading).includes(token) ||
          normalizeText(section.content).includes(token),
      ),
    )
    if (matched) {
      return matched.content
    }
  }
  // Fall back to sentence-level search in flat content
  const sentences = document.content.split(/(?<=[.!?])\s+/)
  const matched = sentences.find((sentence) => tokens.some((token) => normalizeText(sentence).includes(token)))
  return matched || document.summary || document.content.split('.')[0]
}

function findSectionHint(document: CorpusDocument, query: string): string | undefined {
  if (!document.sections || document.sections.length === 0) return undefined
  const tokens = tokenize(query)
  const matched = document.sections.find((section) =>
    tokens.some(
      (token) =>
        normalizeText(section.heading).includes(token) ||
        normalizeText(section.content).includes(token),
    ),
  )
  return matched?.heading
}

export function groundQuestion(
  corpusData: Corpus,
  query: string,
  options: { role?: UserRole; provider?: ProviderId; limit?: number; candidateLimit?: number } = {},
): GroundingResult {
  const role = options.role || 'analyst'
  const provider = options.provider || 'openai'
  const limit = Math.max(1, options.limit || 3)
  const candidateLimit = Math.max(limit, options.candidateLimit || 10)
  const normalizedQuery = normalizeText(query)

  if (/sharepoint\s+sites|sites\s+are\s+available|available\s+sites/.test(normalizedQuery)) {
    return {
      status: 'no_answer',
      provider,
      query,
      localAnswer: 'DeepVault is answering from indexed document content, not from SharePoint site inventory.',
      sources: [],
      deniedSources: [],
      chunkCount: 0,
      tokenCount: 0,
      latencyMs: 0,
      primaryDocumentId: null,
    }
  }

  const allResults = searchDocuments(corpusData, query, { role, limit: candidateLimit, includeDenied: true })
  const deniedMatches = allResults.filter(({ document }) => !canAccessDocument(document, role))
  const permittedMatches = allResults.filter(({ document }) => canAccessDocument(document, role))
  const deniedSources = deniedMatches.map(({ document, score }) => buildSource(document, score, corpusData, query))

  if (permittedMatches.length === 0) {
    if (deniedMatches.length > 0) {
      return {
        status: 'no_permitted_sources',
        provider,
        query,
        localAnswer: 'I found relevant content, but your current role cannot access the matching sources.',
        sources: [],
        deniedSources,
        chunkCount: 0,
        tokenCount: 0,
        latencyMs: 0,
        primaryDocumentId: null,
      }
    }

    return {
      status: 'no_answer',
      provider,
      query,
      localAnswer: 'No relevant content was found in the indexed pilot corpus.',
      sources: [],
      deniedSources,
      chunkCount: 0,
      tokenCount: 0,
      latencyMs: 0,
      primaryDocumentId: null,
    }
  }

  const sources = permittedMatches.slice(0, limit).map(({ document, score }) => ({
    ...buildSource(document, score, corpusData, query),
    siteName: getSiteById(corpusData, document.siteId)?.name || document.siteId,
  }))
  const primary = sources[0]
  const primaryDocument = corpusData.documents.find((document) => document.id === primary.id)

  if (!primaryDocument) {
    return {
      status: 'no_answer',
      provider,
      query,
      localAnswer: 'No relevant content was found in the indexed pilot corpus.',
      sources: [],
      deniedSources,
      chunkCount: 0,
      tokenCount: 0,
      latencyMs: 0,
      primaryDocumentId: null,
    }
  }

  const localAnswer = summarizeSentence(primaryDocument, query)
  const chunkCount = sources.length * 6
  const tokenCount = Math.min(2400, 120 + query.length * 12 + sources.reduce((total, source) => total + source.snippet.length, 0))
  const latencyMs = Math.min(2400, 180 + sources.length * 90 + query.length * 4)

  return {
    status: 'answered',
    provider,
    query,
    localAnswer,
    sources,
    deniedSources,
    chunkCount,
    tokenCount,
    latencyMs,
    primaryDocumentId: primaryDocument.id,
  }
}

function buildSource(document: CorpusDocument, score: number, corpusData: Corpus, query?: string): SourceRecord {
  return {
    id: document.id,
    title: document.title,
    siteId: document.siteId,
    siteName: getSiteById(corpusData, document.siteId)?.name || '',
    path: document.path,
    webUrl: document.webUrl,
    updatedAt: document.updatedAt,
    author: document.author,
    score,
    summary: document.summary,
    tags: document.tags,
    access: document.access,
    snippet: document.directAnswer || document.summary,
    source: document.source,
    sectionHint: query ? findSectionHint(document, query) : undefined,
    fileType: document.fileType,
  }
}

export function buildSiteSummaries(corpusData: Corpus, role: UserRole = 'analyst'): SiteSummary[] {
  return corpusData.sites.map((site) => {
    const documents = corpusData.documents.filter((document) => document.siteId === site.id)
    const permittedDocuments = documents.filter((document) => canAccessDocument(document, role))
    const latestSync = [...corpusData.syncRuns]
      .filter((run) => run.siteIds.includes(site.id))
      .sort((left, right) => new Date(right.finishedAt).getTime() - new Date(left.finishedAt).getTime())[0]

    return {
      ...site,
      documentCount: documents.length,
      permittedDocumentCount: permittedDocuments.length,
      chunkCount: permittedDocuments.length * 6,
      lastRefresh: latestSync?.finishedAt || null,
      lastRefreshStatus: latestSync?.status || 'pending',
    }
  })
}

export function buildExplorerRows(
  corpusData: Corpus,
  query: string,
  options: { role?: UserRole; siteId?: string } = {},
): Array<CorpusDocument & { score: number; siteName: string; siteUrl: string }> {
  const results = searchDocuments(corpusData, query, { ...options, includeDenied: false })
  return results.map(({ document, score }) => ({
    ...document,
    score,
    siteName: getSiteById(corpusData, document.siteId)?.name || document.siteId,
    siteUrl: getSiteById(corpusData, document.siteId)?.url || '',
  }))
}

export function answerQuestion(
  corpusData: Corpus,
  query: string,
  options: { role?: UserRole; provider?: ProviderId; limit?: number; candidateLimit?: number } = {},
): AnswerResult {
  const grounding = groundQuestion(corpusData, query, options)

  return {
    status: grounding.status,
    provider: grounding.provider,
    query: grounding.query,
    answer: grounding.localAnswer,
    sources: grounding.sources,
    deniedSources: grounding.deniedSources,
    chunkCount: grounding.chunkCount,
    tokenCount: grounding.tokenCount,
    latencyMs: grounding.latencyMs,
  }
}

export function buildSyncOverview(corpusData: Corpus, role: UserRole = 'analyst'): SyncOverview {
  const siteSummaries = buildSiteSummaries(corpusData, role)
  const documents = corpusData.documents.filter((document) => canAccessDocument(document, role))
  const lastRun = [...corpusData.syncRuns]
    .sort((left, right) => new Date(right.finishedAt).getTime() - new Date(left.finishedAt).getTime())[0]

  return {
    siteSummaries,
    documentCount: documents.length,
    chunkCount: documents.length * 6,
    syncedSites: siteSummaries.filter((site) => site.status === 'synced').length,
    restrictedSites: siteSummaries.filter((site) => site.status === 'restricted').length,
    providerReadiness: corpusData.providers,
    lastRun,
    refreshPolicy: 'Incremental daily refresh with manual refresh on demand',
  }
}

export function summarizeCorpus(corpusData: Corpus, role: UserRole = 'analyst') {
  const syncOverview = buildSyncOverview(corpusData, role)
  return {
    ...syncOverview,
    sourcesIndexed: corpusData.documents.length,
    visibleSources: corpusData.documents.filter((document) => canAccessDocument(document, role)).length,
    deniedSources: corpusData.documents.filter((document) => !canAccessDocument(document, role)).length,
  }
}
