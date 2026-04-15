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

const GENERIC_DOC_TOKENS = new Set([
  'content',
  'copy',
  'doc',
  'docs',
  'document',
  'documents',
  'draft',
  'file',
  'files',
  'final',
  'image',
  'images',
  'library',
  'libraries',
  'list',
  'lists',
  'note',
  'notes',
  'page',
  'pages',
  'path',
  'pdf',
  'ppt',
  'pptx',
  'presentation',
  'shared',
  'sharepoint',
  'sheet',
  'sheets',
  'slide',
  'slides',
  'source',
  'sources',
  'spreadsheet',
  'tab',
  'tabs',
  'text',
  'track',
  'tracking',
  'version',
])

export function normalizeText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token))
}

export function isMeaningfulToken(token: string): boolean {
  return Boolean(token) && !STOP_WORDS.has(token) && !GENERIC_DOC_TOKENS.has(token)
}

export function extractMeaningfulTokens(value: string | string[]): string[] {
  const text = Array.isArray(value) ? value.join(' ') : value
  return [...new Set(tokenize(text).filter(isMeaningfulToken))]
}

export function getDocumentScore(document: {
  title: string
  summary: string
  content: string
  tags: string[]
  path: string
  sections?: Array<{ heading: string; content: string }>
  author?: string
  fileType?: string
}, query: string): number {
  const tokens = tokenize(query)
  if (tokens.length === 0) {
    return 0
  }

  const titleTokens = new Set(extractMeaningfulTokens(document.title))
  const summaryTokens = new Set(extractMeaningfulTokens(document.summary))
  const tagTokens = new Set(extractMeaningfulTokens(document.tags))
  const pathTokens = new Set(extractMeaningfulTokens(document.path))
  const authorTokens = document.author ? new Set(extractMeaningfulTokens(document.author)) : new Set<string>()
  const fileTypeTokens = document.fileType ? new Set(tokenize(document.fileType)) : new Set<string>()
  const normalizedContent = normalizeText(document.content)

  // Pre-compute section fields once when sections are available
  const sectionFields = (document.sections || []).map((section) => ({
    heading: normalizeText(section.heading),
    content: normalizeText(section.content),
  }))

  let score = 0
  for (const token of tokens) {
    if (titleTokens.has(token)) {
      score += 8
    }
    if (summaryTokens.has(token)) {
      score += 6
    }
    if (sectionFields.length > 0) {
      // Section heading match is a strong structural signal
      for (const field of sectionFields) {
        if (field.heading.includes(token)) {
          score += 7
        }
        if (field.content.includes(token)) {
          score += 4
        }
      }
    } else if (normalizedContent.includes(token)) {
      // Fall back to flat content when no sections are available
      score += 4
    }
    if (tagTokens.has(token)) {
      score += 5
    }
    if (pathTokens.has(token)) {
      score += 2
    }
    if (authorTokens.has(token)) {
      score += 3
    }
    if (fileTypeTokens.has(token)) {
      score += 2
    }
  }

  return score
}
