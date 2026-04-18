import type { EntraSettings } from '../hooks/useEntraSettings'
import type { BishopSettings } from '../hooks/useBishopSettings'
import {
  BISHOP_SETTINGS_DEFAULTS,
} from '../hooks/useBishopSettings'
import type { ProviderSecrets } from '../hooks/useProviderSecrets'
import type { WorkerSettings, WorkerFallbackMode, WorkerMode } from '../hooks/useWorkerSettings'
import { WORKER_SETTINGS_DEFAULTS } from '../hooks/useWorkerSettings'
import type { ProviderId, UserRole } from './runtime-types'

export interface SettingsTransferPayload {
  schemaVersion: '1.0'
  exportedAt: string
  runtime: {
    role: UserRole
    provider: ProviderId
    siteFilter: string
    conversationContextEnabled: boolean
  }
  bishopSettings: BishopSettings
  providerSecrets: ProviderSecrets
  entraSettings: EntraSettings
  workerSettings: WorkerSettings
}

export interface SettingsTransferSnapshot {
  role: UserRole
  provider: ProviderId
  siteFilter: string
  conversationContextEnabled: boolean
  bishopSettings: BishopSettings
  providerSecrets: ProviderSecrets
  entraSettings: EntraSettings
  workerSettings: WorkerSettings
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseRole(value: unknown): UserRole | null {
  return value === 'analyst' || value === 'admin' || value === 'guest' ? value : null
}

function parseProvider(value: unknown): ProviderId | null {
  return value === 'openai' || value === 'gemini' || value === 'anthropic' ? value : null
}

function parseWorkerMode(value: unknown): WorkerMode | null {
  return value === 'local' || value === 'remote' ? value : null
}

function parseWorkerFallbackMode(value: unknown): WorkerFallbackMode | null {
  return value === 'read_only' || value === 'block' || value === 'none' ? value : null
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  const rounded = Math.round(value)
  return Math.min(maximum, Math.max(minimum, rounded))
}

function normalizeBishopSettings(value: unknown): BishopSettings | null {
  if (!isRecord(value)) {
    return null
  }

  const sourceLimit = clampInteger(value.sourceLimit, 1, 8, BISHOP_SETTINGS_DEFAULTS.sourceLimit)
  const candidateLimit = clampInteger(
    value.candidateLimit,
    sourceLimit,
    20,
    Math.max(BISHOP_SETTINGS_DEFAULTS.candidateLimit, sourceLimit),
  )
  const historyTurnLimit = clampInteger(value.historyTurnLimit, 0, 20, BISHOP_SETTINGS_DEFAULTS.historyTurnLimit)

  return { sourceLimit, candidateLimit, historyTurnLimit }
}

function normalizeProviderSecrets(value: unknown): ProviderSecrets | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    openaiApiKey: trimString(value.openaiApiKey),
    geminiApiKey: trimString(value.geminiApiKey),
    anthropicApiKey: trimString(value.anthropicApiKey),
  }
}

function normalizeEntraSettings(value: unknown): EntraSettings | null {
  if (!isRecord(value)) {
    return null
  }

  const dataMode = value.dataMode === 'mock' || value.dataMode === 'live' || value.dataMode === '' ? value.dataMode : null
  if (dataMode === null) {
    return null
  }

  return {
    appId: trimString(value.appId),
    tenantId: trimString(value.tenantId),
    secretValue: trimString(value.secretValue),
    sites: trimString(value.sites),
    siteNames: trimString(value.siteNames),
    dataMode,
  }
}

function normalizeWorkerSettings(value: unknown): WorkerSettings | null {
  if (!isRecord(value)) {
    return null
  }

  const workerMode = parseWorkerMode(value.workerMode)
  const workerFallbackMode = parseWorkerFallbackMode(value.workerFallbackMode)
  if (!workerMode || !workerFallbackMode) {
    return null
  }

  return {
    workerMode,
    workerUrl: trimString(value.workerUrl),
    workerToken: trimString(value.workerToken),
    workerTimeoutSeconds: clampInteger(
      value.workerTimeoutSeconds,
      5,
      300,
      WORKER_SETTINGS_DEFAULTS.workerTimeoutSeconds,
    ),
    workerFallbackMode,
    analyzeLimit: clampInteger(value.analyzeLimit, 1, 5000, WORKER_SETTINGS_DEFAULTS.analyzeLimit),
  }
}

export function buildSettingsTransferPayload(snapshot: SettingsTransferSnapshot): SettingsTransferPayload {
  return {
    schemaVersion: '1.0',
    exportedAt: new Date().toISOString(),
    runtime: {
      role: snapshot.role,
      provider: snapshot.provider,
      siteFilter: snapshot.siteFilter,
      conversationContextEnabled: snapshot.conversationContextEnabled,
    },
    bishopSettings: { ...snapshot.bishopSettings },
    providerSecrets: { ...snapshot.providerSecrets },
    entraSettings: { ...snapshot.entraSettings },
    workerSettings: { ...snapshot.workerSettings },
  }
}

export function parseSettingsTransferPayload(value: unknown): SettingsTransferPayload {
  if (!isRecord(value)) {
    throw new Error('Configuration import failed: expected a JSON object.')
  }

  if (value.schemaVersion !== '1.0') {
    throw new Error('Configuration import failed: unsupported schema version.')
  }

  if (typeof value.exportedAt !== 'string' || !value.exportedAt.trim()) {
    throw new Error('Configuration import failed: missing exportedAt timestamp.')
  }

  if (!isRecord(value.runtime)) {
    throw new Error('Configuration import failed: missing runtime settings.')
  }

  const role = parseRole(value.runtime.role)
  const provider = parseProvider(value.runtime.provider)
  const siteFilter = trimString(value.runtime.siteFilter)
  const conversationContextEnabled = value.runtime.conversationContextEnabled

  if (!role || !provider || typeof conversationContextEnabled !== 'boolean') {
    throw new Error('Configuration import failed: runtime settings are invalid.')
  }

  const bishopSettings = normalizeBishopSettings(value.bishopSettings)
  const providerSecrets = normalizeProviderSecrets(value.providerSecrets)
  const entraSettings = normalizeEntraSettings(value.entraSettings)
  const workerSettings = normalizeWorkerSettings(value.workerSettings)

  if (!bishopSettings || !providerSecrets || !entraSettings || !workerSettings) {
    throw new Error('Configuration import failed: one or more settings sections are invalid.')
  }

  return {
    schemaVersion: '1.0',
    exportedAt: value.exportedAt,
    runtime: {
      role,
      provider,
      siteFilter,
      conversationContextEnabled,
    },
    bishopSettings,
    providerSecrets,
    entraSettings,
    workerSettings,
  }
}
