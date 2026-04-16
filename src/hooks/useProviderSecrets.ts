import { useEffect, useState } from 'react'
import type { ProviderId } from '../lib/deepvault'

export const PROVIDER_SECRETS_STORAGE_KEY = 'deepvault_provider_secrets'

export interface ProviderSecrets {
  openaiApiKey: string
  geminiApiKey: string
  anthropicApiKey: string
}

function emptySecrets(): ProviderSecrets {
  return {
    openaiApiKey: '',
    geminiApiKey: '',
    anthropicApiKey: '',
  }
}

function readStorage(storage: Storage | undefined): Partial<ProviderSecrets> | null {
  if (!storage) {
    return null
  }

  const raw = storage.getItem(PROVIDER_SECRETS_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as Partial<ProviderSecrets>
  } catch {
    return null
  }
}

function readProviderSecrets(): ProviderSecrets {
  if (typeof window === 'undefined') {
    return emptySecrets()
  }

  const localValue = readStorage(window.localStorage)
  if (localValue) {
    return {
      openaiApiKey: localValue.openaiApiKey?.trim() || '',
      geminiApiKey: localValue.geminiApiKey?.trim() || '',
      anthropicApiKey: localValue.anthropicApiKey?.trim() || '',
    }
  }

  const legacyValue = readStorage(window.sessionStorage)
  if (legacyValue) {
    const migrated = {
      openaiApiKey: legacyValue.openaiApiKey?.trim() || '',
      geminiApiKey: legacyValue.geminiApiKey?.trim() || '',
      anthropicApiKey: legacyValue.anthropicApiKey?.trim() || '',
    }
    window.localStorage.setItem(PROVIDER_SECRETS_STORAGE_KEY, JSON.stringify(migrated, null, 2))
    window.sessionStorage.removeItem(PROVIDER_SECRETS_STORAGE_KEY)
    return migrated
  }

  return emptySecrets()
}

export function useProviderSecrets() {
  const [providerSecrets, setProviderSecrets] = useState<ProviderSecrets>(() => readProviderSecrets())

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(PROVIDER_SECRETS_STORAGE_KEY, JSON.stringify(providerSecrets, null, 2))
    window.sessionStorage.removeItem(PROVIDER_SECRETS_STORAGE_KEY)
  }, [providerSecrets])

  const setApiKey = (provider: ProviderId, value: string) => {
    const trimmed = value.trim()
    setProviderSecrets((current) => {
      if (provider === 'openai') {
        return { ...current, openaiApiKey: trimmed }
      }
      if (provider === 'gemini') {
        return { ...current, geminiApiKey: trimmed }
      }
      return { ...current, anthropicApiKey: trimmed }
    })
  }

  const clearProviderSecrets = () => {
    setProviderSecrets(emptySecrets())
  }

  return {
    providerSecrets,
    setApiKey,
    clearProviderSecrets,
  }
}
