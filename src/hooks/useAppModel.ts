import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  buildExplorerRows,
  buildSiteSummaries,
  buildSyncOverview,
  resolveSharePointFileUrl,
  summarizeCorpus,
  type Corpus,
  type CorpusDocument,
  type ProviderId,
  type UserRole,
} from '../lib/deepvault'
import { useBishopConversation } from './useBishopConversation'
import { useLiveCorpus } from './useLiveCorpus'
import { useEntraSettings } from './useEntraSettings'
import { useProviderSecrets } from './useProviderSecrets'
import { useSyncOperations } from './useSyncOperations'
import type { LiveState } from './useLiveCorpus'
import type { EntraSettings } from './useEntraSettings'
import type { SyncOperationJob } from './useSyncOperations'
import { resolveCorpusMode } from '../lib/corpus-mode'

export type AppTab = 'explorer' | 'bishop' | 'sync' | 'ai-stats' | 'settings'

export type ExplorerRow = CorpusDocument & { score: number; siteName: string }

export interface AppModel {
  activeTab: AppTab
  setActiveTab: Dispatch<SetStateAction<AppTab>>
  activeScopeLabel: string
  corpusProviders: Corpus['providers']
  liveState: LiveState
  provider: ProviderId
  setProvider: Dispatch<SetStateAction<ProviderId>>
  role: UserRole
  setRole: Dispatch<SetStateAction<UserRole>>
  search: string
  setSearch: Dispatch<SetStateAction<string>>
  selectedDocId: string
  setSelectedDocId: Dispatch<SetStateAction<string>>
  selectedExplorerDoc: ExplorerRow | null
  siteFilter: string
  setSiteFilter: Dispatch<SetStateAction<string>>
  siteSummaries: ReturnType<typeof buildSiteSummaries>
  scopedCorpusSummary: ReturnType<typeof summarizeCorpus>
  scopedSiteSummaries: ReturnType<typeof buildSiteSummaries>
  scopedSyncOverview: ReturnType<typeof buildSyncOverview>
  explorerRows: ExplorerRow[]
  providerSecrets: ReturnType<typeof useProviderSecrets>['providerSecrets']
  setProviderSecret: ReturnType<typeof useProviderSecrets>['setApiKey']
  clearProviderSecrets: ReturnType<typeof useProviderSecrets>['clearProviderSecrets']
  entraSettings: EntraSettings
  setEntraSetting: ReturnType<typeof useEntraSettings>['setEntraSetting']
  clearEntraSettings: ReturnType<typeof useEntraSettings>['clearEntraSettings']
  question: string
  setQuestion: Dispatch<SetStateAction<string>>
  isAsking: boolean
  conversationContextEnabled: boolean
  setConversationContextEnabled: Dispatch<SetStateAction<boolean>>
  syncOperations: {
    activeJob: SyncOperationJob | null
    cancelActiveJob: () => void
    history: SyncOperationJob[]
    isRunning: boolean
    lastCompletedJob: SyncOperationJob | null
    startEvaluate: () => void
    startExportLive: () => void
    startExportLiveResume: () => void
    startIngest: () => void
    startRefresh: () => void
  }
  messages: ReturnType<typeof useBishopConversation>['messages']
  selectedMessage: ReturnType<typeof useBishopConversation>['selectedMessage']
  handleAsk: ReturnType<typeof useBishopConversation>['handleAsk']
  clearBishopHistory: ReturnType<typeof useBishopConversation>['clearHistory']
  exportBishopJson: ReturnType<typeof useBishopConversation>['exportJson']
  exportBishopMarkdown: ReturnType<typeof useBishopConversation>['exportMarkdown']
  resolveFileHref: (_siteId: string, _path: string, _webUrl?: string | null) => string | null
}

function buildScopedCorpus(corpus: Corpus, siteFilter: string): Corpus {
  if (siteFilter === 'all') {
    return corpus
  }

  const selectedSite = corpus.sites.find((site) => site.id === siteFilter)
  if (!selectedSite) {
    return corpus
  }

  return {
    ...corpus,
    sites: [selectedSite],
    syncRuns: corpus.syncRuns.filter((run) => run.siteIds.includes(siteFilter)),
    documents: corpus.documents.filter((document) => document.siteId === siteFilter),
  }
}

export function useAppModel(): AppModel {
  const { entraSettings, setEntraSetting, clearEntraSettings } = useEntraSettings()
  const requestedCorpusMode = resolveCorpusMode(import.meta.env.VITE_DEEPVAULT_DATA_MODE, entraSettings.dataMode)
  const { corpusBundle, liveState, refreshCorpus } = useLiveCorpus(requestedCorpusMode)
  const corpus = corpusBundle.corpus
  const [activeTab, setActiveTab] = useState<AppTab>('explorer')
  const [role, setRole] = useState<UserRole>(corpus.defaultUserRole)
  const [provider, setProvider] = useState<ProviderId>(corpus.providers[0].id)
  const [siteFilter, setSiteFilter] = useState<string>('all')
  const [search, setSearch] = useState<string>('')
  const [selectedDocId, setSelectedDocId] = useState<string>(corpus.documents[0].id)
  const { providerSecrets, setApiKey: setProviderSecret, clearProviderSecrets } = useProviderSecrets()

  const siteSummaries = useMemo(() => buildSiteSummaries(corpus, role), [corpus, role])
  const scopedCorpus = useMemo(() => buildScopedCorpus(corpus, siteFilter), [corpus, siteFilter])
  const scopedSiteSummaries = useMemo(() => buildSiteSummaries(scopedCorpus, role), [scopedCorpus, role])
  const scopedSyncOverview = useMemo(() => buildSyncOverview(scopedCorpus, role), [scopedCorpus, role])
  const scopedCorpusSummary = useMemo(() => summarizeCorpus(scopedCorpus, role), [scopedCorpus, role])
  const explorerRows = useMemo<ExplorerRow[]>(
    () => buildExplorerRows(scopedCorpus, search, { role }) as ExplorerRow[],
    [scopedCorpus, role, search],
  )
  const selectedExplorerDoc = explorerRows.find((document) => document.id === selectedDocId) || explorerRows[0] || null
  const activeSiteSummary = siteSummaries.find((site) => site.id === siteFilter)
  const activeScopeLabel = siteFilter === 'all' ? 'All sites' : activeSiteSummary?.name || siteFilter
  const {
    question,
    setQuestion,
    isAsking,
    conversationContextEnabled,
    setConversationContextEnabled,
    messages,
    selectedMessage,
    handleAsk,
    clearHistory: clearBishopHistory,
    exportJson: exportBishopJson,
    exportMarkdown: exportBishopMarkdown,
  } = useBishopConversation({
    corpus: scopedCorpus,
    role,
    provider,
    endpoint: import.meta.env.VITE_BISHOP_LLM_ENDPOINT,
    openaiApiKey: providerSecrets.openaiApiKey,
    geminiApiKey: providerSecrets.geminiApiKey,
    anthropicApiKey: providerSecrets.anthropicApiKey,
    onActivateTab: () => setActiveTab('bishop'),
  })
  const extraEnv = useMemo(() => {
    const env: Record<string, string> = {}
    if (providerSecrets.openaiApiKey) env.OPENAI_API_KEY = providerSecrets.openaiApiKey
    if (providerSecrets.geminiApiKey) env.GEMINI_API_KEY = providerSecrets.geminiApiKey
    if (providerSecrets.anthropicApiKey) env.ANTHROPIC_API_KEY = providerSecrets.anthropicApiKey
    if (entraSettings.appId) env.DEEPVAULT_ENTRA_APP_ID = entraSettings.appId
    if (entraSettings.tenantId) env.DEEPVAULT_ENTRA_TENANT_ID = entraSettings.tenantId
    if (entraSettings.secretValue) env.DEEPVAULT_ENTRA_SECRET_VALUE = entraSettings.secretValue
    if (entraSettings.sites) env.DEEPVAULT_ENTRA_SITES = entraSettings.sites
    if (entraSettings.siteNames) env.DEEPVAULT_PILOT_SITE_NAMES = entraSettings.siteNames
    if (entraSettings.dataMode) env.DEEPVAULT_DATA_MODE = entraSettings.dataMode
    return env
  }, [providerSecrets, entraSettings])

  const syncOperations = useSyncOperations({
    activeScopeLabel,
    extraEnv,
    provider,
    role,
    visibleDocs: scopedCorpusSummary.visibleSources,
    syncedSites: scopedSyncOverview.syncedSites,
    restrictedSites: scopedSyncOverview.restrictedSites,
    refreshPolicy: scopedSyncOverview.refreshPolicy,
    onRefreshCorpus: refreshCorpus,
  })

  useEffect(() => {
    if (explorerRows.length === 0) {
      if (selectedDocId !== '') {
        setSelectedDocId('')
      }
      return
    }

    if (!explorerRows.some((document) => document.id === selectedDocId)) {
      setSelectedDocId(explorerRows[0].id)
    }
  }, [explorerRows, selectedDocId])

  useEffect(() => {
    document.title = 'Nexus'
  }, [])

  const resolveFileHref = useCallback(
    (siteId: string, path: string, webUrl?: string | null) => resolveSharePointFileUrl(corpus, siteId, path, webUrl),
    [corpus],
  )

  return {
    activeTab,
    setActiveTab,
    activeScopeLabel,
    corpusProviders: corpus.providers,
    liveState,
    provider,
    setProvider,
    role,
    setRole,
    search,
    setSearch,
    selectedDocId,
    setSelectedDocId,
    selectedExplorerDoc,
    siteFilter,
    setSiteFilter,
    siteSummaries,
    scopedCorpusSummary,
    scopedSiteSummaries,
    scopedSyncOverview,
    explorerRows,
    providerSecrets,
    setProviderSecret,
    clearProviderSecrets,
    entraSettings,
    setEntraSetting,
    clearEntraSettings,
    question,
    setQuestion,
    isAsking,
    conversationContextEnabled,
    setConversationContextEnabled,
    syncOperations,
    messages,
    selectedMessage,
    handleAsk,
    clearBishopHistory,
    exportBishopJson,
    exportBishopMarkdown,
    resolveFileHref,
  }
}
