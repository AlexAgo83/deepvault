export type UserRole = 'analyst' | 'admin' | 'guest'
export type ProviderId = 'openai' | 'gemini' | 'anthropic'

export interface ProviderRecord {
  id: ProviderId
  name: string
  ready: boolean
}

export interface SiteRecord {
  id: string
  name: string
  url: string
  libraryCount: number
  listCount: number
  status: 'synced' | 'restricted' | 'pending' | 'sync_failed'
  access: (UserRole | 'all')[]
  owner: string
}

export interface SyncRun {
  id: string
  startedAt: string
  finishedAt: string
  scope: string
  status: 'synced' | 'restricted' | 'pending' | 'sync_failed'
  siteIds: string[]
  documentsSynced: number
  chunksWritten: number
  notes: string
}

export interface CorpusSection {
  heading: string
  content: string
}

export type AnalysisStatus = 'not_analyzed' | 'analyzed' | 'excluded' | 'failed' | 'stale'

export interface DocumentAnalysis {
  status: AnalysisStatus
  version: string
  provider?: string
  requestedProvider?: string
  model?: string
  requestedModel?: string
  analyzedAt?: string
  contentHash?: string
  summary?: string
  keywords?: string[]
  sections?: CorpusSection[]
  documentType?: string
  confidence?: number
  providerStatus?: 'local' | 'provider' | 'fallback'
  excludedReason?: string
  failureReason?: string
  fallbackReason?: string
}

export interface CorpusDocument {
  id: string
  siteId: string
  kind: string
  title: string
  path: string
  webUrl?: string
  author: string
  createdBy?: string
  lastModifiedBy?: string
  updatedAt: string
  summary: string
  directAnswer: string
  content: string
  tags: string[]
  access: (UserRole | 'all')[]
  source: string
  sections?: CorpusSection[]
  fileType?: string
  analysis?: DocumentAnalysis
}

export interface Corpus {
  schemaVersion?: string
  defaultUserRole: UserRole
  providers: ProviderRecord[]
  sites: SiteRecord[]
  syncRuns: SyncRun[]
  documents: CorpusDocument[]
}

export interface SourceRecord {
  id: string
  title: string
  siteId: string
  siteName: string
  path: string
  webUrl?: string
  updatedAt: string
  author: string
  createdBy?: string
  lastModifiedBy?: string
  score: number
  summary: string
  tags: string[]
  access: (UserRole | 'all')[]
  snippet: string
  source: string
  sectionHint?: string
  fileType?: string
}

export type BishopArtifactFormat = 'txt' | 'md' | 'json' | 'csv'
export type BishopArtifactStatus = 'none' | 'ready' | 'unsupported_format' | 'generation_failed'

export interface BishopArtifact {
  kind: 'document'
  format: BishopArtifactFormat
  filename: string
  mimeType: string
  content: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  status: string
  sources: SourceRecord[]
  createdAt?: string
  provider?: ProviderId
  model?: string
  orchestrationMode?: 'remote' | 'fallback' | 'grounded-only'
  chunkCount?: number
  tokenCount?: number
  inputTokenCount?: number
  outputTokenCount?: number
  usageKind?: 'provider' | 'partial' | 'local'
  latencyMs?: number
  confidenceScore?: number
  providerTracePreview?: string
  improvementHint?: string
  artifact?: BishopArtifact
  artifactStatus?: BishopArtifactStatus
  artifactNotice?: string
}

export interface EvaluationRow {
  id: string
  query: string
  expectedSourceId: string | null
  role: UserRole
  expectedStatus: 'answered' | 'no_answer' | 'no_permitted_sources'
}
