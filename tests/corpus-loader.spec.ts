import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadCorpus } from '../scripts/corpus-loader'

describe('corpus loader', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('loads a valid corpus file', async () => {
    const corpusPath = resolve('tmp/corpus-loader-valid.json')
    await mkdir(resolve('tmp'), { recursive: true })
    await writeFile(
      corpusPath,
      JSON.stringify(
        {
          defaultUserRole: 'analyst',
          providers: [{ id: 'openai', name: 'OpenAI', ready: false }],
          sites: [],
          syncRuns: [],
          documents: [],
        },
        null,
        2,
      ),
    )

    await expect(loadCorpus({ mode: 'mock', inputPath: corpusPath })).resolves.toMatchObject({
      corpusPath,
      mode: 'mock',
      corpus: { defaultUserRole: 'analyst' },
    })
  })

  it('rejects a malformed corpus file with a clear error', async () => {
    const corpusPath = resolve('tmp/corpus-loader-invalid.json')
    await mkdir(resolve('tmp'), { recursive: true })
    await writeFile(corpusPath, JSON.stringify({ defaultUserRole: 'analyst', providers: [] }, null, 2))

    await expect(loadCorpus({ mode: 'mock', inputPath: corpusPath })).rejects.toThrow(
      `Invalid corpus at ${corpusPath}: expected a DeepVault corpus payload.`,
    )
  })
})
