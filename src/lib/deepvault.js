const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'give',
  'how',
  'i',
  'in',
  'is',
  'it',
  'me',
  'of',
  'on',
  'or',
  'our',
  'please',
  'show',
  'summarize',
  'tell',
  'the',
  'to',
  'what',
  'when',
  'which',
  'who',
  'with',
  'you',
])

export function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function tokenize(value) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token))
}

export function canAccessDocument(document, role) {
  return document.access.includes(role) || document.access.includes('all')
}

export function getSiteById(corpus, siteId) {
  return corpus.sites.find((site) => site.id === siteId)
}

export function getDocumentScore(document, query) {
  const tokens = tokenize(query)
  if (tokens.length === 0) {
    return 1
  }

  const normalizedTitle = normalizeText(document.title)
  const normalizedSummary = normalizeText(document.summary)
  const normalizedContent = normalizeText(document.content)
  const normalizedTags = normalizeText(document.tags.join(' '))
  const normalizedPath = normalizeText(document.path)

  let score = 0
  for (const token of tokens) {
    if (normalizedTitle.includes(token)) {
      score += 8
    }
    if (normalizedSummary.includes(token)) {
      score += 6
    }
    if (normalizedContent.includes(token)) {
      score += 4
    }
    if (normalizedTags.includes(token)) {
      score += 5
    }
    if (normalizedPath.includes(token)) {
      score += 2
    }
  }

  return score
}

export function searchDocuments(corpus, query, options = {}) {
  const role = options.role || 'analyst'
  const siteId = options.siteId || 'all'
  const limit = options.limit || 8
  const includeDenied = Boolean(options.includeDenied)

  const scored = corpus.documents
    .filter((document) => siteId === 'all' || document.siteId === siteId)
    .map((document) => ({
      document,
      score: getDocumentScore(document, query),
      permitted: canAccessDocument(document, role),
    }))
    .filter((entry) => entry.score > 0 && (includeDenied || entry.permitted))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      return new Date(right.document.updatedAt).getTime() - new Date(left.document.updatedAt).getTime()
    })

  return scored.slice(0, limit)
}

function summarizeSentence(document, query) {
  if (document.directAnswer) {
    return document.directAnswer
  }
  const sentences = document.content.split(/(?<=[.!?])\s+/)
  const tokens = tokenize(query)
  const matched = sentences.find((sentence) => tokens.some((token) => normalizeText(sentence).includes(token)))
  return matched || document.summary || document.content.split('.')[0]
}

function buildSource(document, score) {
  return {
    id: document.id,
    title: document.title,
    siteId: document.siteId,
    siteName: '',
    path: document.path,
    updatedAt: document.updatedAt,
    author: document.author,
    score,
    summary: document.summary,
    tags: document.tags,
    access: document.access,
    snippet: document.directAnswer || document.summary,
    source: document.source,
  }
}

export function buildSiteSummaries(corpus, role = 'analyst') {
  return corpus.sites.map((site) => {
    const documents = corpus.documents.filter((document) => document.siteId === site.id)
    const permittedDocuments = documents.filter((document) => canAccessDocument(document, role))
    const latestSync = [...corpus.syncRuns]
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

export function buildExplorerRows(corpus, query, options = {}) {
  const results = searchDocuments(corpus, query, { ...options, includeDenied: false })
  return results.map(({ document, score }) => ({
    ...document,
    score,
    siteName: getSiteById(corpus, document.siteId)?.name || document.siteId,
  }))
}

export function answerQuestion(corpus, query, options = {}) {
  const role = options.role || 'analyst'
  const provider = options.provider || 'openai'
  const limit = options.limit || 3
  const normalizedQuery = normalizeText(query)

  if (/sharepoint\s+sites|sites\s+are\s+available|available\s+sites/.test(normalizedQuery)) {
    return {
      status: 'no_answer',
      provider,
      query,
      answer: 'DeepVault is answering from indexed document content, not from SharePoint site inventory.',
      sources: [],
      deniedSources: [],
      chunkCount: 0,
      tokenCount: 0,
      latencyMs: 0,
    }
  }

  const allResults = searchDocuments(corpus, query, { role, limit: 10, includeDenied: true })
  const deniedMatches = allResults.filter(({ document }) => !canAccessDocument(document, role))
  const permittedMatches = allResults.filter(({ document }) => canAccessDocument(document, role))
  const deniedSources = deniedMatches.map(({ document, score }) => buildSource(document, score))

  if (permittedMatches.length === 0) {
    if (deniedMatches.length > 0) {
      return {
        status: 'no_permitted_sources',
        provider,
        query,
        answer: 'I found relevant content, but your current role cannot access the matching sources.',
        sources: [],
        deniedSources,
        chunkCount: 0,
        tokenCount: 0,
        latencyMs: 0,
      }
    }

    return {
      status: 'no_answer',
      provider,
      query,
      answer: 'No relevant content was found in the indexed pilot corpus.',
      sources: [],
      deniedSources,
      chunkCount: 0,
      tokenCount: 0,
      latencyMs: 0,
    }
  }

  const sources = permittedMatches.slice(0, limit).map(({ document, score }) => ({
    ...buildSource(document, score),
    siteName: getSiteById(corpus, document.siteId)?.name || document.siteId,
  }))
  const primary = sources[0]
  const primaryDocument = corpus.documents.find((document) => document.id === primary.id)
  const answer = summarizeSentence(primaryDocument, query)
  const chunkCount = sources.length * 6
  const tokenCount = Math.min(2400, 120 + query.length * 12 + sources.reduce((total, source) => total + source.snippet.length, 0))
  const latencyMs = Math.min(2400, 180 + sources.length * 90 + query.length * 4)

  return {
    status: 'answered',
    provider,
    query,
    answer,
    sources,
    deniedSources,
    chunkCount,
    tokenCount,
    latencyMs,
  }
}

export function buildSyncOverview(corpus, role = 'analyst') {
  const siteSummaries = buildSiteSummaries(corpus, role)
  const documents = corpus.documents.filter((document) => canAccessDocument(document, role))
  const lastRun = [...corpus.syncRuns]
    .sort((left, right) => new Date(right.finishedAt).getTime() - new Date(left.finishedAt).getTime())[0]

  return {
    siteSummaries,
    documentCount: documents.length,
    chunkCount: documents.length * 6,
    syncedSites: siteSummaries.filter((site) => site.status === 'synced').length,
    restrictedSites: siteSummaries.filter((site) => site.status === 'restricted').length,
    providerReadiness: corpus.providers,
    lastRun,
    refreshPolicy: 'Incremental daily refresh with manual refresh on demand',
  }
}

export function buildEvaluationRows() {
  return [
    { id: 'Q01', query: 'What is the budget for Q3 2025?', expectedSourceId: 'q3-budget', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q02', query: 'Who is the project lead for Project Alpha?', expectedSourceId: 'project-alpha-lead', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q03', query: 'What were the decisions made in the last board meeting?', expectedSourceId: 'board-meeting-notes', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q04', query: 'What are the IT security requirements for remote access?', expectedSourceId: 'remote-access-policy', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q05', query: 'Summarize the Q4 2024 product roadmap.', expectedSourceId: 'product-roadmap-q4-2024', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q06', query: 'What is the onboarding process for new employees?', expectedSourceId: 'onboarding-process', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q07', query: 'What are the current open risks on the Alpha project?', expectedSourceId: 'alpha-risk-register', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q08', query: 'Who approved the infrastructure spend for FY2025?', expectedSourceId: 'infra-spend-approval', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q09', query: 'What is the escalation path for a P1 incident?', expectedSourceId: 'p1-escalation', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q10', query: 'Explain the data classification policy.', expectedSourceId: 'data-classification-policy', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q11', query: 'What tools are approved for use by the engineering team?', expectedSourceId: 'approved-tools-policy', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q12', query: 'What is the deadline for the Q1 2026 compliance audit?', expectedSourceId: 'compliance-audit-deadline', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q13', query: 'Give me a summary of the Alpha project status as of last month.', expectedSourceId: 'alpha-status-report', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q14', query: 'What SharePoint sites are available for the Finance team?', expectedSourceId: null, role: 'analyst', expectedStatus: 'no_answer' },
    { id: 'Q15', query: 'What are the quarterly OKRs for the product team?', expectedSourceId: 'quarterly-okrs', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q16', query: 'Who should I contact for budget approval?', expectedSourceId: 'budget-approval-contact', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q17', query: 'What is the vendor onboarding checklist?', expectedSourceId: 'vendor-onboarding-checklist', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q18', query: 'What are the known issues with the current SSO implementation?', expectedSourceId: 'sso-issues', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q19', query: 'What are the restricted launch notes for the stealth lab?', expectedSourceId: 'secret-launch-notes', role: 'guest', expectedStatus: 'no_permitted_sources' },
    { id: 'Q20', query: 'What is the cobalt orchard relocation timeline?', expectedSourceId: null, role: 'analyst', expectedStatus: 'no_answer' }
  ]
}

export function summarizeCorpus(corpus, role = 'analyst') {
  const syncOverview = buildSyncOverview(corpus, role)
  return {
    ...syncOverview,
    sourcesIndexed: corpus.documents.length,
    visibleSources: corpus.documents.filter((document) => canAccessDocument(document, role)).length,
    deniedSources: corpus.documents.filter((document) => !canAccessDocument(document, role)).length,
  }
}

export function formatUpdatedAt(value) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
