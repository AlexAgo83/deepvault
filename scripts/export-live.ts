import { resolve } from 'node:path'
import { summarizeCorpus, type Corpus } from '../src/lib/deepvault'
import { loadProjectEnv } from './runtime-env'
import {
  buildLiveExportCorpus,
  liveCheckpointPath,
  normalizeMode,
  readCliArg,
  readCliFlag,
  readCorpusLikeFile,
} from './live-export-state'
import {
  acquireGraphAccessToken,
  buildDeepVaultExportConfig,
  buildSiteDefinitions,
  GraphClient,
  exportSiteCorpus,
  type CorpusLike,
  type DeepVaultExportConfig,
  writeCorpusFile,
} from './deepvault-graph'

async function loadMockCorpus(): Promise<Corpus> {
  const content = await import('node:fs/promises').then(({ readFile }) => readFile(resolve('data/pilot-corpus.json'), 'utf8'))
  return JSON.parse(content) as Corpus
}

async function runMockExport(outputPath: string): Promise<void> {
  const corpus = await loadMockCorpus()
  await writeCorpusFile(outputPath, corpus)
  const role = corpus.defaultUserRole || 'analyst'
  const summary = summarizeCorpus(corpus, role)
  console.log(`Wrote ${outputPath}`)
  console.log(`Mode: mock`)
  console.log(`Visible documents: ${summary.visibleSources}`)
  console.log(`Pilot sites: ${corpus.sites.length}`)
}

async function runLiveExport(config: DeepVaultExportConfig, outputPath: string): Promise<void> {
  const token = await acquireGraphAccessToken(config)
  const client = new GraphClient(config.baseUrl, token, config.timeoutSeconds)
  const siteDefinitions = buildSiteDefinitions(config)
  const resumeCheckpoint = readCliFlag(process.argv, '--resume')
  const checkpointCorpus = resumeCheckpoint ? await readCorpusLikeFile(liveCheckpointPath) : null

  if (siteDefinitions.length === 0) {
    throw new Error('DEEPVAULT_ENTRA_SITES must list at least one SharePoint site URL.')
  }

  const sites: CorpusLike['sites'] = []
  const documents: CorpusLike['documents'] = []
  const siteIds: string[] = []
  let totalLibraries = sites.reduce((sum, site) => sum + site.libraryCount, 0)
  let totalLists = sites.reduce((sum, site) => sum + site.listCount, 0)
  const startedAt = new Date().toISOString()

  if (resumeCheckpoint && checkpointCorpus) {
    if (checkpointCorpus.sites) {
      sites.push(...checkpointCorpus.sites)
      totalLibraries = sites.reduce((sum, site) => sum + site.libraryCount, 0)
      totalLists = sites.reduce((sum, site) => sum + site.listCount, 0)
    }
    if (checkpointCorpus.documents) {
      documents.push(...checkpointCorpus.documents)
    }
    if (checkpointCorpus.syncRuns?.[0]?.siteIds) {
      siteIds.push(...checkpointCorpus.syncRuns[0].siteIds)
    }
  }

  async function writeCheckpoint() {
    await writeCorpusFile(
      liveCheckpointPath,
      buildLiveExportCorpus(config, {
        startedAt,
        sites,
        documents,
        siteIds,
        totalLibraries,
        totalLists,
        notes: `Checkpointed ${documents.length} documents from ${totalLibraries} libraries and ${totalLists} lists.`,
        status: 'synced',
      }),
    )
  }

  for (const definition of siteDefinitions) {
    const existingSite = resumeCheckpoint ? sites.find((site) => site.url === definition.url) : undefined

    if (existingSite) {
      console.log(`[${definition.name}] Reusing checkpointed export`)
      if (!siteIds.includes(existingSite.id)) {
        siteIds.push(existingSite.id)
      }
      continue
    }

    try {
      console.log(`[${definition.name}] Starting export`)
      const exported = await exportSiteCorpus(client, definition, (message) => console.log(message))
      sites.push(exported.site)
      documents.push(...exported.documents)
      siteIds.push(exported.site.id)
      totalLibraries += exported.driveCount
      totalLists += exported.listCount
      console.log(`[${definition.name}] Export finished with ${exported.documents.length} documents`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sites.push({
        id: definition.url,
        name: definition.name,
        url: definition.url,
        libraryCount: 0,
        listCount: 0,
        status: 'restricted',
        access: ['admin'],
        owner: definition.name,
      })
      console.log(`Skipped ${definition.url}: ${message}`)
    }

    await writeCheckpoint()
  }

  const corpus = buildLiveExportCorpus(config, {
    startedAt,
    sites,
    documents,
    siteIds,
    totalLibraries,
    totalLists,
    notes: `Exported ${documents.length} documents from ${totalLibraries} libraries and ${totalLists} lists.`,
    status: 'synced',
  })

  console.log(`Export summary: ${documents.length} documents across ${totalLibraries} libraries and ${totalLists} lists`)
  await writeCorpusFile(outputPath, corpus)
  await writeCheckpoint()
  const role = corpus.defaultUserRole || 'analyst'
  const summary = summarizeCorpus(corpus as Corpus, role)
  console.log(`Wrote ${outputPath}`)
  console.log(`Mode: live`)
  console.log(`Visible documents: ${summary.visibleSources}`)
  console.log(`Pilot sites: ${corpus.sites.length}`)
  console.log(`Libraries: ${totalLibraries}`)
  console.log(`Lists: ${totalLists}`)
}

await loadProjectEnv()

const mode = normalizeMode(readCliArg(process.argv, '--mode') || process.env.DEEPVAULT_DATA_MODE)
const outputPath = resolve(readCliArg(process.argv, '--output') || 'public/live-corpus.json')
const useMock = mode === 'mock' || readCliFlag(process.argv, '--mock')
const resumeCheckpoint = readCliFlag(process.argv, '--resume')
const config = buildDeepVaultExportConfig()

console.log(`Auth mode: ${config.authMode}`)
console.log(`Client secret loaded: ${config.secretValue ? 'yes' : 'no'}`)
console.log(`Configured sites: ${config.siteUrls.length}`)
console.log(`Checkpoint resume: ${resumeCheckpoint ? 'yes' : 'no'}`)

if (useMock) {
  await runMockExport(outputPath)
} else {
  await runLiveExport(config, outputPath)
}
