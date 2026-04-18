import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { publishAnalyzedCorpus } from '../scripts/publish-analyzed-corpus'

describe('publish analyzed corpus', () => {
  afterEach(async () => {
    // leave tmp artifacts in place; tests use unique file names per suite
  })

  it('publishes the analyzed corpus into the live corpus path', async () => {
    const inputPath = resolve('tmp/publish-analyzed-input.json')
    const outputPath = resolve('tmp/publish-analyzed-output.json')
    await mkdir(resolve('tmp'), { recursive: true })
    await writeFile(
      inputPath,
      JSON.stringify(
        {
          schemaVersion: '1.1',
          defaultUserRole: 'analyst',
          providers: [{ id: 'openai', name: 'OpenAI', ready: true }],
          sites: [{ id: 'site-1', name: 'Site 1', url: 'https://example.test', libraryCount: 1, listCount: 0, status: 'synced', access: ['analyst'], owner: 'Site 1' }],
          syncRuns: [],
          documents: [
            {
              id: 'doc-1',
              siteId: 'site-1',
              kind: 'pdf',
              title: 'Analyzed Doc',
              path: '/Docs/analyzed.pdf',
              author: 'alex',
              updatedAt: '2026-04-18T00:00:00.000Z',
              summary: 'Base summary',
              directAnswer: '',
              content: 'x'.repeat(400),
              tags: [],
              access: ['analyst'],
              source: 'sharepoint',
              analysis: {
                status: 'analyzed',
                version: '1.0',
                provider: 'openai',
                model: 'gpt-5.4-mini',
                analyzedAt: '2026-04-18T00:10:00.000Z',
                contentHash: 'abc',
                summary: 'Analyzed summary',
                documentType: 'pdf',
                confidence: 88,
                keywords: ['budget'],
                sections: [{ heading: 'Summary', content: 'Analyzed section' }],
              },
            },
          ],
        },
        null,
        2,
      ),
    )

    const result = await publishAnalyzedCorpus({ inputPath, outputPath })
    const published = JSON.parse(await readFile(outputPath, 'utf8')) as { documents: Array<{ analysis?: { status?: string } }> }

    expect(result.analyzedCount).toBe(1)
    expect(result.outputPath).toBe(outputPath)
    expect(published.documents[0]?.analysis?.status).toBe('analyzed')
  })

  it('supports dry-run mode without writing the published corpus', async () => {
    const inputPath = resolve('tmp/publish-analyzed-dry-run-input.json')
    const outputPath = resolve('tmp/publish-analyzed-dry-run-output.json')
    await mkdir(resolve('tmp'), { recursive: true })
    await writeFile(
      inputPath,
      JSON.stringify(
        {
          schemaVersion: '1.1',
          defaultUserRole: 'analyst',
          providers: [],
          sites: [],
          syncRuns: [],
          documents: [],
        },
        null,
        2,
      ),
    )

    const result = await publishAnalyzedCorpus({ inputPath, outputPath, dryRun: true })

    expect(result.dryRun).toBe(true)
    await expect(readFile(outputPath, 'utf8')).rejects.toThrow()
  })
})
