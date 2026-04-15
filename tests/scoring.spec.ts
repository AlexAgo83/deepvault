import { describe, expect, it } from 'vitest'
import { extractMeaningfulTokens, getDocumentScore, tokenize } from '../src/lib/scoring'

const BASE_DOC = {
  title: 'Notes',
  summary: 'General notes',
  content: 'Some flat content',
  tags: [] as string[],
  path: '/Documents/Notes.md',
}

describe('scoring helpers', () => {
  it('tokenizes by removing stop words and punctuation', () => {
    expect(tokenize('What is the Q3 budget for the pilot site?')).toEqual(['q3', 'budget', 'pilot', 'site'])
  })

  it('extracts meaningful tokens while skipping generic document noise', () => {
    expect(extractMeaningfulTokens('Shared documents for the Smart Connector PDF')).toEqual(['smart', 'connector'])
  })

  it('scores title matches above broad content matches', () => {
    const titleMatch = getDocumentScore(
      {
        title: 'Q3 Budget',
        summary: 'Pilot budget summary',
        content: 'Budget content',
        tags: ['finance'],
        path: '/Documents/Q3 Budget.docx',
      },
      'q3 budget',
    )
    const contentMatch = getDocumentScore(
      {
        title: 'Notes',
        summary: 'General notes',
        content: 'Q3 budget discussed here',
        tags: ['finance'],
        path: '/Documents/Notes.docx',
      },
      'q3 budget',
    )

    expect(titleMatch).toBeGreaterThan(contentMatch)
  })

  it('returns zero for empty or stop-word-only queries without throwing', () => {
    expect(
      getDocumentScore(
        {
          title: 'Q3 Budget',
          summary: 'Pilot budget summary',
          content: 'Budget content',
          tags: ['finance'],
          path: '/Documents/Q3 Budget.docx',
        },
        '',
      ),
    ).toBe(0)
    expect(
      getDocumentScore(
        {
          title: '',
          summary: 'Pilot budget summary',
          content: 'Budget content',
          tags: ['finance'],
          path: '/Documents/Q3 Budget.docx',
        },
        'the and of',
      ),
    ).toBe(0)
  })

  it('scores a section heading match higher than flat content match', () => {
    const sectionMatch = getDocumentScore(
      {
        ...BASE_DOC,
        sections: [
          { heading: 'Operating Reserve', content: 'The operating reserve was kept at 6 percent.' },
        ],
      },
      'operating reserve',
    )
    const contentOnlyMatch = getDocumentScore(
      {
        ...BASE_DOC,
        content: 'The operating reserve was kept at 6 percent.',
      },
      'operating reserve',
    )

    // Section heading match (7 per token) beats flat content match (4 per token)
    expect(sectionMatch).toBeGreaterThan(contentOnlyMatch)
  })

  it('scores section content match at the same weight as flat content', () => {
    const sectionContentMatch = getDocumentScore(
      {
        ...BASE_DOC,
        sections: [
          { heading: 'Unrelated Heading', content: 'The operating reserve was 6 percent.' },
        ],
      },
      'operating reserve',
    )
    const flatContentMatch = getDocumentScore(
      {
        ...BASE_DOC,
        content: 'The operating reserve was 6 percent.',
      },
      'operating reserve',
    )

    expect(sectionContentMatch).toBe(flatContentMatch)
  })

  it('falls back to flat content scoring when sections are absent', () => {
    const score = getDocumentScore(
      {
        ...BASE_DOC,
        content: 'budget approval document',
      },
      'budget',
    )

    expect(score).toBeGreaterThan(0)
  })

  it('scores author name matches', () => {
    const withAuthorMatch = getDocumentScore(
      { ...BASE_DOC, author: 'Elena Rossi' },
      'elena rossi',
    )
    const withoutAuthor = getDocumentScore(BASE_DOC, 'elena rossi')

    expect(withAuthorMatch).toBeGreaterThan(withoutAuthor)
  })

  it('scores file type matches', () => {
    const spreadsheetMatch = getDocumentScore(
      { ...BASE_DOC, fileType: 'spreadsheet' },
      'spreadsheet',
    )
    const noTypeMatch = getDocumentScore(BASE_DOC, 'spreadsheet')

    expect(spreadsheetMatch).toBeGreaterThan(noTypeMatch)
  })
})
