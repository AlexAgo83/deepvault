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
  resolveLiveExportResumeState,
} from './live-export-state'
import {
  acquireGraphAccessToken,
  buildDeepVaultExportConfig,
  buildSiteDefinitions,
  GraphClient,
  exportSiteCorpus,
  type CorpusLike,
  type CorpusSiteLike,
  type DeepVaultExportConfig,
  writeCorpusFile,
} from './deepvault-graph'

async function loadMockCorpus(): Promise<Corpus> {
  const content = await import('node:fs/promises').then(({ readFile }) => readFile(resolve('data/pilot-corpus.json'), 'utf8'))
  return JSON.parse(content) as Corpus
}

async function runMockExport(outputPath: string, dryRun: boolean): Promise<void> {
  const corpus = await loadMockCorpus()
  const role = corpus.defaultUserRole || 'analyst'
  const summary = summarizeCorpus(corpus, role)
  if (!dryRun) {
    await writeCorpusFile(outputPath, corpus)
  }
  console.log(dryRun ? `Dry run target: ${outputPath}` : `Wrote ${outputPath}`)
  console.log(`Mode: mock`)
  console.log(`Dry run: ${dryRun ? 'yes' : 'no'}`)
  console.log(`Visible documents: ${summary.visibleSources}`)
  console.log(`Pilot sites: ${corpus.sites.length}`)
}

async function runLiveExport(
  config: DeepVaultExportConfig,
  outputPath: string,
  options: { dryRun: boolean; resumeCheckpoint: boolean },
): Promise<void> {
  const token = await acquireGraphAccessToken(config)
  const client = new GraphClient(config.baseUrl, token, config.timeoutSeconds)
  const siteDefinitions = buildSiteDefinitions(config)
  const checkpointCorpus = options.resumeCheckpoint ? await readCorpusLikeFile(liveCheckpointPath) : null
  const resumeState = resolveLiveExportResumeState(options.resumeCheckpoint, checkpointCorpus)

  if (siteDefinitions.length === 0) {
    throw new Error('DEEPVAULT_ENTRA_SITES must list at least one SharePoint site URL.')
  }

  const sites: CorpusLike['sites'] = resumeState.seedFromCheckpoint && checkpointCorpus?.sites ? [...checkpointCorpus.sites] : []
  let documents: CorpusLike['documents'] = resumeState.seedFromCheckpoint && checkpointCorpus?.documents ? [...checkpointCorpus.documents] : []
  const siteIds: string[] = resumeState.seedFromCheckpoint && checkpointCorpus?.syncRuns?.[0]?.siteIds
    ? [...checkpointCorpus.syncRuns[0].siteIds]
    : []
  const startedAt = new Date().toISOString()
  let totalLibraries = sites.reduce((sum, site) => sum + site.libraryCount, 0)
  let totalLists = sites.reduce((sum, site) => sum + site.listCount, 0)
  let skippedDocuments = 0
  let ingestedDocuments = 0

  function upsertDocuments(existingDocuments: CorpusLike['documents'], incomingDocuments: CorpusLike['documents']) {
    const byId = new Map(existingDocuments.map((document) => [document.id, document]))
    for (const document of incomingDocuments) {
      byId.set(document.id, document)
    }
    return [...byId.values()]
  }

  function upsertSite(existingSite: CorpusLike['sites'][number]) {
    const index = sites.findIndex((site) => site.id === existingSite.id || site.url === existingSite.url)
    if (index >= 0) {
      sites[index] = existingSite
    } else {
      sites.push(existingSite)
    }
  }

  async function writeCheckpoint(syncedAt: string) {
    if (options.dryRun) {
      return
    }
    await writeCorpusFile(
      liveCheckpointPath,
      buildLiveExportCorpus(config, {
        startedAt,
        syncedAt,
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
    try {
      console.log(
        `[${definition.name}] Starting export${resumeState.updatedAfter ? ` (delta from ${resumeState.updatedAfter})` : ' (full sync)'}`,
      )
      const exported = await exportSiteCorpus(
        client,
        definition,
        (message) => console.log(message),
        { updatedAfter: resumeState.updatedAfter },
      )
      upsertSite(exported.site)
      documents = upsertDocuments(documents, exported.documents)
      if (!siteIds.includes(exported.site.id)) {
        siteIds.push(exported.site.id)
      }
      totalLibraries = sites.reduce((sum, site) => sum + site.libraryCount, 0)
      totalLists = sites.reduce((sum, site) => sum + site.listCount, 0)
      skippedDocuments += exported.skippedDocuments
      ingestedDocuments += exported.documents.length
      console.log(`[${definition.name}] Export finished with ${exported.documents.length} documents (${exported.skippedDocuments} skipped)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const fallbackSite: CorpusSiteLike = {
        id: definition.url,
        name: definition.name,
        url: definition.url,
        libraryCount: 0,
        listCount: 0,
        status: 'restricted',
        access: ['admin'],
        owner: definition.name,
      }
      upsertSite(fallbackSite)
      totalLibraries = sites.reduce((sum, site) => sum + site.libraryCount, 0)
      totalLists = sites.reduce((sum, site) => sum + site.listCount, 0)
      console.log(`Skipped ${definition.url}: ${message}`)
    }

    await writeCheckpoint(new Date().toISOString())
  }

  const syncedAt = new Date().toISOString()
  const corpus = buildLiveExportCorpus(config, {
    startedAt,
    syncedAt,
    sites,
    documents,
    siteIds,
    totalLibraries,
    totalLists,
    notes: `Exported ${documents.length} documents from ${totalLibraries} libraries and ${totalLists} lists.`,
    status: 'synced',
  })

  console.log(`Export summary: ${documents.length} documents across ${totalLibraries} libraries and ${totalLists} lists`)
  console.log(`Delta stats: skipped ${skippedDocuments}, ingested ${ingestedDocuments}`)
  if (options.dryRun) {
    console.log('Dry run: no files were written.')
  } else {
    await writeCorpusFile(outputPath, corpus)
    await writeCheckpoint(syncedAt)
  }
  const role = corpus.defaultUserRole || 'analyst'
  const summary = summarizeCorpus(corpus as Corpus, role)
  console.log(options.dryRun ? `Dry run target: ${outputPath}` : `Wrote ${outputPath}`)
  console.log(`Mode: live`)
  console.log(`Dry run: ${options.dryRun ? 'yes' : 'no'}`)
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
const dryRun = readCliFlag(process.argv, '--dry-run')
const config = buildDeepVaultExportConfig()

console.log(`Auth mode: ${config.authMode}`)
console.log(`Client secret loaded: ${config.secretValue ? 'yes' : 'no'}`)
console.log(`Configured sites: ${config.siteUrls.length}`)
console.log(`Checkpoint resume flag: ${resumeCheckpoint ? 'yes' : 'no'}`)
console.log(`Dry run: ${dryRun ? 'yes' : 'no'}`)

if (useMock) {
  await runMockExport(outputPath, dryRun)
} else {
  await runLiveExport(config, outputPath, { dryRun, resumeCheckpoint })
}
