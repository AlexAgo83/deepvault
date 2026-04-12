import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildLiveExportCorpus,
  normalizeMode,
  readCliArg,
  readCliFlag,
  readCorpusLikeFile,
} from '../scripts/live-export-state'

const config = {
  authMode: 'delegated',
  baseUrl: 'https://graph.microsoft.com/v1.0',
  timeoutSeconds: 30,
  scopes: ['Sites.Read.All'],
  siteUrls: ['https://example.sharepoint.com/sites/pilot'],
  siteNames: ['Pilot'],
  appId: 'app-id',
  tenantId: 'tenant-id',
  secretValue: '',
}

describe('live export state helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('parses cli args and flags from argv', () => {
    const argv = ['node', 'scripts/export-live.ts', '--mode', 'mock', '--resume']

    expect(readCliArg(argv, '--mode')).toBe('mock')
    expect(readCliArg(argv, '--output')).toBeUndefined()
    expect(readCliFlag(argv, '--resume')).toBe(true)
    expect(readCliFlag(argv, '--mock')).toBe(false)
  })

  it('normalizes requested modes', () => {
    expect(normalizeMode('mock')).toBe('mock')
    expect(normalizeMode('live')).toBe('live')
    expect(normalizeMode(undefined)).toBe('live')
  })

  it('builds a live export corpus snapshot', () => {
    const corpus = buildLiveExportCorpus(config, {
      startedAt: '2026-04-11T11:30:00.000Z',
      sites: [
        {
          id: 'site-1',
          name: 'Pilot',
          url: 'https://example.sharepoint.com/sites/pilot',
          libraryCount: 2,
          listCount: 1,
          status: 'synced',
          access: ['analyst'],
          owner: 'Pilot',
        },
      ],
      documents: [
        {
          id: 'doc-1',
          siteId: 'site-1',
          kind: 'md',
          title: 'Readme',
          path: '/Docs/Readme.md',
          author: 'Pilot',
          updatedAt: '2026-04-11T11:45:00.000Z',
          summary: 'Readme summary',
          directAnswer: 'Readme direct answer',
          content: 'Readme content',
          tags: ['pilot'],
          access: ['analyst'],
          source: 'SharePoint',
        },
      ],
      siteIds: ['site-1'],
      totalLibraries: 2,
      totalLists: 1,
      notes: 'Checkpointed 1 documents from 2 libraries and 1 lists.',
      status: 'synced',
    })

    expect(corpus.defaultUserRole).toBe('analyst')
    expect(corpus.providers).toEqual([
      { id: 'openai', name: 'OpenAI', ready: false },
      { id: 'gemini', name: 'Gemini', ready: false },
      { id: 'anthropic', name: 'Claude', ready: false },
    ])
    expect(corpus.syncRuns[0]).toMatchObject({
      scope: 'SharePoint live export from 1 configured site(s)',
      status: 'synced',
      siteIds: ['site-1'],
      documentsSynced: 1,
      chunksWritten: 6,
      notes: 'Checkpointed 1 documents from 2 libraries and 1 lists.',
    })
    expect(corpus.documents).toHaveLength(1)
  })

  it('reads a checkpoint corpus file when present', async () => {
    const checkpointPath = resolve('tmp/live-export-state-checkpoint.json')
    await mkdir(resolve('tmp'), { recursive: true })
    await writeFile(
      checkpointPath,
      JSON.stringify(
        {
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

    await expect(readCorpusLikeFile(checkpointPath)).resolves.toMatchObject({ defaultUserRole: 'analyst' })
    await writeFile(resolve('tmp/live-export-state-invalid.json'), JSON.stringify({ defaultUserRole: 'analyst' }, null, 2))
    await expect(readCorpusLikeFile(resolve('tmp/live-export-state-invalid.json'))).resolves.toBeNull()
    await expect(readCorpusLikeFile(resolve('tmp/missing-live-export-state.json'))).resolves.toBeNull()
  })
})
