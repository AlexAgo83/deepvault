import { useEffect, useState } from 'react'

export const ENTRA_SETTINGS_STORAGE_KEY = 'deepvault_entra_settings'
export const ENTRA_SETTINGS_SECRET_STORAGE_KEY = 'deepvault_entra_settings_secret'

export interface EntraSettings {
  appId: string
  tenantId: string
  secretValue: string
  sites: string
  siteNames: string
  dataMode: '' | 'mock' | 'live'
}

const EMPTY: EntraSettings = {
  appId: '',
  tenantId: '',
  secretValue: '',
  sites: '',
  siteNames: '',
  dataMode: '',
}

function readEntraSettings(): EntraSettings {
  if (typeof window === 'undefined') return EMPTY

  const raw = window.localStorage.getItem(ENTRA_SETTINGS_STORAGE_KEY)
  const secretRaw = window.localStorage.getItem(ENTRA_SETTINGS_SECRET_STORAGE_KEY)
  const legacySecretRaw = window.sessionStorage.getItem(ENTRA_SETTINGS_SECRET_STORAGE_KEY)
  const legacyInlineSecretRaw = raw ? raw : null

  try {
    const parsed = raw ? JSON.parse(raw) as Partial<EntraSettings> : {}
    const secretParsed = secretRaw ? JSON.parse(secretRaw) as Partial<Pick<EntraSettings, 'secretValue'>> : {}
    const legacySecretParsed = legacySecretRaw ? JSON.parse(legacySecretRaw) as Partial<Pick<EntraSettings, 'secretValue'>> : {}
    const legacyInlineParsed = legacyInlineSecretRaw ? JSON.parse(legacyInlineSecretRaw) as Partial<EntraSettings> : {}
    const secretValue = secretParsed.secretValue?.trim() || legacySecretParsed.secretValue?.trim() || legacyInlineParsed.secretValue?.trim() || ''

    if (secretValue && !secretRaw) {
      window.localStorage.setItem(ENTRA_SETTINGS_SECRET_STORAGE_KEY, JSON.stringify({ secretValue }, null, 2))
    }
    if (legacySecretRaw) {
      window.sessionStorage.removeItem(ENTRA_SETTINGS_SECRET_STORAGE_KEY)
    }
    if (legacyInlineParsed.secretValue) {
      const sanitized = { ...legacyInlineParsed }
      delete sanitized.secretValue
      window.localStorage.setItem(ENTRA_SETTINGS_STORAGE_KEY, JSON.stringify(sanitized, null, 2))
    }

    return {
      appId: parsed.appId?.trim() || '',
      tenantId: parsed.tenantId?.trim() || '',
      secretValue,
      sites: parsed.sites?.trim() || '',
      siteNames: parsed.siteNames?.trim() || '',
      dataMode: parsed.dataMode === 'mock' || parsed.dataMode === 'live' ? parsed.dataMode : '',
    }
  } catch {
    return EMPTY
  }
}

export function useEntraSettings() {
  const [entraSettings, setEntraSettings] = useState<EntraSettings>(() => readEntraSettings())

  useEffect(() => {
    if (typeof window === 'undefined') return

    const { secretValue, ...rest } = entraSettings
    window.localStorage.setItem(ENTRA_SETTINGS_STORAGE_KEY, JSON.stringify(rest, null, 2))
    window.localStorage.setItem(ENTRA_SETTINGS_SECRET_STORAGE_KEY, JSON.stringify({ secretValue }, null, 2))
    window.sessionStorage.removeItem(ENTRA_SETTINGS_SECRET_STORAGE_KEY)
  }, [entraSettings])

  const setEntraSetting = (key: keyof EntraSettings, value: string) => {
    setEntraSettings((current) => ({ ...current, [key]: value.trim() }))
  }

  const clearEntraSettings = () => {
    setEntraSettings(EMPTY)
  }

  return { entraSettings, setEntraSetting, clearEntraSettings }
}
