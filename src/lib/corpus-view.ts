import { getDocumentScore, normalizeText, tokenize } from './corpus-ranking'
import type {
  Corpus,
  CorpusDocument,
  CorpusSection,
  ProviderRecord,
  SiteRecord,
  SourceRecord,
  SyncRun,
  UserRole,
} from './runtime-types'

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

export function canAccessDocument(document: Pick<CorpusDocument, 'access'>, role: UserRole): boolean {
  return document.access.includes(role) || document.access.includes('all')
}

function getPreferredSummary(document: CorpusDocument): string {
  if (document.analysis?.status === 'analyzed' && document.analysis.summary?.trim()) {
    return document.analysis.summary.trim()
  }

  return document.summary
}

function getPreferredSections(document: CorpusDocument): CorpusSection[] {
  if (document.analysis?.status === 'analyzed' && document.analysis.sections?.length) {
    return document.analysis.sections
  }

  return document.sections || []
}

function getPreferredKeywords(document: CorpusDocument): string[] {
  if (document.analysis?.status === 'analyzed' && document.analysis.keywords?.length) {
    return document.analysis.keywords
  }

  return []
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
      score: getDocumentScore(
        {
          ...document,
          summary: getPreferredSummary(document),
          tags: [...document.tags, ...getPreferredKeywords(document)],
          sections: getPreferredSections(document),
        },
        query,
      ),
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
