import * as corpusView from './corpus-view'
import { normalizeText, tokenize } from './scoring'
import type {
  AnswerResult,
  Corpus,
  CorpusDocument,
  CorpusSection,
  GroundingResult,
  ProviderId,
  SourceRecord,
  UserRole,
} from './deepvault'

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

function summarizeSentence(document: CorpusDocument, query: string): string {
  if (document.directAnswer) {
    return document.directAnswer
  }
  const tokens = tokenize(query)
  const sections = getPreferredSections(document)
  if (sections.length > 0) {
    const matched = sections.find((section) =>
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
  const sentences = document.content.split(/(?<=[.!?])\s+/)
  const matched = sentences.find((sentence) => tokens.some((token) => normalizeText(sentence).includes(token)))
  return matched || getPreferredSummary(document) || document.content.split('.')[0]
}

function findSectionHint(document: CorpusDocument, query: string): string | undefined {
  const sections = getPreferredSections(document)
  if (sections.length === 0) return undefined
  const tokens = tokenize(query)
  const matched = sections.find((section) =>
    tokens.some(
      (token) =>
        normalizeText(section.heading).includes(token) ||
        normalizeText(section.content).includes(token),
    ),
  )
  return matched?.heading
}

function buildSource(document: CorpusDocument, score: number, corpusData: Corpus, query?: string): SourceRecord {
  return {
    id: document.id,
    title: document.title,
    siteId: document.siteId,
    siteName: corpusView.getSiteById(corpusData, document.siteId)?.name || '',
    path: document.path,
    webUrl: document.webUrl,
    updatedAt: document.updatedAt,
    author: document.author,
    score,
    summary: getPreferredSummary(document),
    tags: [...document.tags, ...getPreferredKeywords(document)],
    access: document.access,
    snippet: document.directAnswer || document.summary,
    source: document.source,
    sectionHint: query ? findSectionHint(document, query) : undefined,
    fileType: document.fileType,
  }
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

  const allResults = corpusView.searchDocuments(corpusData, query, { role, limit: candidateLimit, includeDenied: true })
  const deniedMatches = allResults.filter(({ document }) => !corpusView.canAccessDocument(document, role))
  const permittedMatches = allResults.filter(({ document }) => corpusView.canAccessDocument(document, role))
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
      deniedSources: [],
      chunkCount: 0,
      tokenCount: 0,
      latencyMs: 0,
      primaryDocumentId: null,
    }
  }

  const sources = permittedMatches.slice(0, limit).map(({ document, score }) => ({
    ...buildSource(document, score, corpusData, query),
    siteName: corpusView.getSiteById(corpusData, document.siteId)?.name || document.siteId,
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
      deniedSources: [],
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
    usageKind: 'local',
    latencyMs: grounding.latencyMs,
  }
}
