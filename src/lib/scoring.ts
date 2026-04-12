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

export function getDocumentScore(document: {
  title: string
  summary: string
  content: string
  tags: string[]
  path: string
}, query: string): number {
  const tokens = tokenize(query)
  if (tokens.length === 0) {
    return 0
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
