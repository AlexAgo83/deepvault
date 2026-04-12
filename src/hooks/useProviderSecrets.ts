import { useEffect, useState } from 'react'
import type { ProviderId } from '../lib/deepvault'

export const PROVIDER_SECRETS_STORAGE_KEY = 'deepvault_provider_secrets'

export interface ProviderSecrets {
  openaiApiKey: string
  geminiApiKey: string
  anthropicApiKey: string
}

function readProviderSecrets(): ProviderSecrets {
  if (typeof window === 'undefined') {
    return {
      openaiApiKey: '',
      geminiApiKey: '',
      anthropicApiKey: '',
    }
  }

  const raw = window.localStorage.getItem(PROVIDER_SECRETS_STORAGE_KEY)
  if (!raw) {
    return {
      openaiApiKey: '',
      geminiApiKey: '',
      anthropicApiKey: '',
    }
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ProviderSecrets>
    return {
      openaiApiKey: parsed.openaiApiKey?.trim() || '',
      geminiApiKey: parsed.geminiApiKey?.trim() || '',
      anthropicApiKey: parsed.anthropicApiKey?.trim() || '',
    }
  } catch {
    return {
      openaiApiKey: '',
      geminiApiKey: '',
      anthropicApiKey: '',
    }
  }
}

export function useProviderSecrets() {
  const [providerSecrets, setProviderSecrets] = useState<ProviderSecrets>(() => readProviderSecrets())

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(PROVIDER_SECRETS_STORAGE_KEY, JSON.stringify(providerSecrets, null, 2))
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
    setProviderSecrets({
      openaiApiKey: '',
      geminiApiKey: '',
      anthropicApiKey: '',
    })
  }

  return {
    providerSecrets,
    setApiKey,
    clearProviderSecrets,
  }
}
