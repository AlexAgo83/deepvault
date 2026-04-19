import { useCallback, useDeferredValue, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  buildExplorerRows,
  buildSiteSummaries,
  buildSyncOverview,
  resolveSharePointFileUrl,
  summarizeCorpus,
} from '../lib/corpus-view'
import type { Corpus, CorpusDocument, ProviderId, UserRole } from '../lib/runtime-types'
import { useBishopConversation } from './useBishopConversation'
import { useAIUsage } from './useAIUsage'
import { useLiveCorpus } from './useLiveCorpus'
import { useHostedAuth } from './useHostedAuth'
import { useEntraSettings } from './useEntraSettings'
import { useBishopSettings } from './useBishopSettings'
import { useProviderSecrets } from './useProviderSecrets'
import { useSyncOperations } from './useSyncOperations'
import { useWorkerSettings } from './useWorkerSettings'
import { useWorkerHealth } from './useWorkerHealth'
import type { LiveState } from './useLiveCorpus'
import type { EntraSettings } from './useEntraSettings'
import type { SyncOperationJob } from './useSyncOperations'
import type { WorkerSettings } from './useWorkerSettings'
import type { WorkerHealthState } from './useWorkerHealth'
import type { BishopSettings } from './useBishopSettings'
import { resolveCorpusMode } from '../lib/corpus-mode'

export type AppTab = 'explorer' | 'bishop' | 'sync' | 'artifacts' | 'ai-stats' | 'settings'

export type ExplorerRow = CorpusDocument & { score: number; siteName: string; siteUrl: string }

const RUNTIME_ROLE_STORAGE_KEY = 'deepvault_runtime_role'

const DEFAULT_PROVIDER_OPTIONS: Array<{ id: ProviderId; name: string }> = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'gemini', name: 'Gemini' },
  { id: 'anthropic', name: 'Claude' },
]

export interface AppModel {
  activeTab: AppTab
  setActiveTab: Dispatch<SetStateAction<AppTab>>
  activeScopeLabel: string
  corpus: Corpus
  scopedCorpus: Corpus
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
  hostedMode: boolean
  hostedIdentityLabel: string | null
  canSignOutHostedSession: boolean
  signOutHostedSession: () => Promise<void>
  isOperator: boolean
  setProviderSecret: ReturnType<typeof useProviderSecrets>['setApiKey']
  clearProviderSecrets: ReturnType<typeof useProviderSecrets>['clearProviderSecrets']
  entraSettings: EntraSettings
  setEntraSetting: ReturnType<typeof useEntraSettings>['setEntraSetting']
  clearEntraSettings: ReturnType<typeof useEntraSettings>['clearEntraSettings']
  workerSettings: WorkerSettings
  workerHealth: WorkerHealthState
  setWorkerSetting: ReturnType<typeof useWorkerSettings>['setWorkerSetting']
  clearWorkerSettings: ReturnType<typeof useWorkerSettings>['clearWorkerSettings']
  bishopSettings: BishopSettings
  setBishopSetting: ReturnType<typeof useBishopSettings>['setBishopSetting']
  clearBishopSettings: ReturnType<typeof useBishopSettings>['clearBishopSettings']
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
    startAnalyze: () => void
    startPublishAnalysis: () => void
    startRefresh: () => void
  }
  aiUsageEvents: ReturnType<typeof useAIUsage>['events']
  aiUsageSummary: ReturnType<typeof useAIUsage>['summary']
  messages: ReturnType<typeof useBishopConversation>['messages']
  selectedMessage: ReturnType<typeof useBishopConversation>['selectedMessage']
  handleAsk: ReturnType<typeof useBishopConversation>['handleAsk']
  clearBishopHistory: ReturnType<typeof useBishopConversation>['clearHistory']
  exportBishopJson: ReturnType<typeof useBishopConversation>['exportJson']
  exportBishopMarkdown: ReturnType<typeof useBishopConversation>['exportMarkdown']
  resolveFileHref: (_siteId: string, _path: string, _webUrl?: string | null) => string | null
}

function parseActiveTab(hash: string): AppTab {
  const search = hash.startsWith('#') ? hash.slice(1) : hash
  const value = new URLSearchParams(search).get('tab')
  if (value === 'explorer' || value === 'bishop' || value === 'sync' || value === 'artifacts' || value === 'ai-stats' || value === 'settings') {
    return value
  }
  if (new URLSearchParams(search).has('sync')) {
    return 'sync'
  }
  return 'explorer'
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

function readStoredRole(defaultRole: UserRole): UserRole {
  try {
    const stored = window.localStorage.getItem(RUNTIME_ROLE_STORAGE_KEY)
    if (stored === 'analyst' || stored === 'admin' || stored === 'guest') {
      return stored
    }
  } catch {
    // ignore storage failures
  }

  return defaultRole
}

export function useAppModel(): AppModel {
  const { entraSettings, setEntraSetting, clearEntraSettings } = useEntraSettings()
  const { workerSettings, setWorkerSetting, clearWorkerSettings } = useWorkerSettings()
  const { bishopSettings, setBishopSetting, clearBishopSettings } = useBishopSettings()
  const requestedCorpusMode = resolveCorpusMode(import.meta.env.VITE_DEEPVAULT_DATA_MODE, entraSettings.dataMode)
  const hostedAuth = useHostedAuth()
  const { corpusBundle, liveState, refreshCorpus } = useLiveCorpus(requestedCorpusMode, {
    accessToken: hostedAuth.accessToken,
    authRequired: hostedAuth.authConfig.enabled,
    authReady: hostedAuth.ready,
  })
  const workerHealth = useWorkerHealth(workerSettings, requestedCorpusMode)
  const corpus = corpusBundle.corpus
  const bishopEndpoint = workerSettings.workerMode === 'remote' && workerSettings.workerUrl
    ? `${workerSettings.workerUrl.replace(/\/$/, '')}/api/bishop/query`
    : import.meta.env.VITE_BISHOP_LLM_ENDPOINT || '/api/bishop/query'
  const [activeTab, setActiveTab] = useState<AppTab>(() => parseActiveTab(window.location.hash))
  const [role, setRole] = useState<UserRole>(() => readStoredRole(corpus.defaultUserRole))
  const [provider, setProvider] = useState<ProviderId>('openai')
  const [siteFilter, setSiteFilter] = useState<string>('all')
  const [search, setSearch] = useState<string>('')
  const deferredSearch = useDeferredValue(search)
  const [selectedDocId, setSelectedDocId] = useState<string>(() => corpus.documents[0]?.id || '')
  const { providerSecrets, setApiKey: setProviderSecret, clearProviderSecrets } = useProviderSecrets()
  const { events: aiUsageEvents, summary: aiUsageSummary } = useAIUsage()
  const hostedMode = hostedAuth.mode === 'hosted'
  const isOperator = hostedMode ? hostedAuth.isOperator : true

  const corpusProviders = useMemo<Corpus['providers']>(() => {
    const providerNames = new Map(DEFAULT_PROVIDER_OPTIONS.map((item) => [item.id, item.name]))

    for (const item of corpus.providers) {
      providerNames.set(item.id, item.name)
    }

    return DEFAULT_PROVIDER_OPTIONS.map((item) => {
      const fromCorpus = corpus.providers.find((providerOption) => providerOption.id === item.id)
      const sessionReady =
        item.id === 'openai'
          ? Boolean(providerSecrets.openaiApiKey)
          : item.id === 'gemini'
            ? Boolean(providerSecrets.geminiApiKey)
            : Boolean(providerSecrets.anthropicApiKey)

      return {
        id: item.id,
        name: providerNames.get(item.id) || item.name,
        ready: Boolean(fromCorpus?.ready) || sessionReady,
      }
    })
  }, [corpus.providers, providerSecrets])

  const siteSummaries = useMemo(() => buildSiteSummaries(corpus, role), [corpus, role])
  const scopedCorpus = useMemo(() => buildScopedCorpus(corpus, siteFilter), [corpus, siteFilter])
  const scopedSiteSummaries = useMemo(() => buildSiteSummaries(scopedCorpus, role), [scopedCorpus, role])
  const scopedSyncOverview = useMemo(() => buildSyncOverview(scopedCorpus, role), [scopedCorpus, role])
  const scopedCorpusSummary = useMemo(() => summarizeCorpus(scopedCorpus, role), [scopedCorpus, role])
  const explorerRows = useMemo<ExplorerRow[]>(
    () => buildExplorerRows(scopedCorpus, deferredSearch, { role }) as ExplorerRow[],
    [scopedCorpus, deferredSearch, role],
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
    bishopSettings,
    endpoint: bishopEndpoint,
    accessToken: hostedAuth.accessToken,
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
    env.DEEPVAULT_DATA_MODE = requestedCorpusMode
    return env
  }, [providerSecrets, entraSettings, requestedCorpusMode])

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
    authToken: hostedAuth.accessToken,
    workerSettings,
  })

  useEffect(() => {
    if (!corpusProviders.some((item) => item.id === provider)) {
      setProvider(corpusProviders[0]?.id || 'openai')
    }
  }, [corpusProviders, provider])

  useEffect(() => {
    try {
      window.localStorage.setItem(RUNTIME_ROLE_STORAGE_KEY, role)
    } catch {
      // ignore storage failures
    }
  }, [role])

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

  useEffect(() => {
    const syncFromHash = () => {
      setActiveTab(parseActiveTab(window.location.hash))
    }

    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '')
    params.set('tab', activeTab)
    if (activeTab !== 'sync') {
      params.delete('sync')
    }
    const nextHash = `#${params.toString()}`
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash)
    }
  }, [activeTab])

  const resolveFileHref = useCallback(
    (siteId: string, path: string, webUrl?: string | null) => resolveSharePointFileUrl(corpus, siteId, path, webUrl),
    [corpus],
  )

  return {
    activeTab,
    setActiveTab,
    activeScopeLabel,
    corpus,
    scopedCorpus,
    corpusProviders,
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
    hostedMode,
    hostedIdentityLabel: hostedAuth.identityLabel,
    canSignOutHostedSession: hostedMode && hostedAuth.ready && Boolean(hostedAuth.authConfig.enabled),
    signOutHostedSession: hostedAuth.signOut,
    isOperator,
    setProviderSecret,
    clearProviderSecrets,
    entraSettings,
    setEntraSetting,
    clearEntraSettings,
    workerSettings,
    workerHealth,
    setWorkerSetting,
    clearWorkerSettings,
    bishopSettings,
    setBishopSetting,
    clearBishopSettings,
    question,
    setQuestion,
    isAsking,
    conversationContextEnabled,
    setConversationContextEnabled,
    syncOperations,
    aiUsageEvents,
    aiUsageSummary,
    messages,
    selectedMessage,
    handleAsk,
    clearBishopHistory,
    exportBishopJson,
    exportBishopMarkdown,
    resolveFileHref,
  }
}
