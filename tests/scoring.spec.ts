import { describe, expect, it } from 'vitest'
import { getDocumentScore, tokenize } from '../src/lib/scoring'

describe('scoring helpers', () => {
  it('tokenizes by removing stop words and punctuation', () => {
    expect(tokenize('What is the Q3 budget for the pilot site?')).toEqual(['q3', 'budget', 'pilot', 'site'])
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
})
