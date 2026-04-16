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
  const secretRaw = window.sessionStorage.getItem(ENTRA_SETTINGS_SECRET_STORAGE_KEY)
  const legacySecretRaw = raw ? raw : null

  try {
    const parsed = raw ? JSON.parse(raw) as Partial<EntraSettings> : {}
    const secretParsed = secretRaw ? JSON.parse(secretRaw) as Partial<Pick<EntraSettings, 'secretValue'>> : {}
    const legacyParsed = legacySecretRaw ? JSON.parse(legacySecretRaw) as Partial<EntraSettings> : {}
    const secretValue = secretParsed.secretValue?.trim() || legacyParsed.secretValue?.trim() || ''

    if (secretValue && !secretRaw) {
      window.sessionStorage.setItem(ENTRA_SETTINGS_SECRET_STORAGE_KEY, JSON.stringify({ secretValue }, null, 2))
    }
    if (legacyParsed.secretValue) {
      const sanitized = { ...legacyParsed }
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
    window.sessionStorage.setItem(ENTRA_SETTINGS_SECRET_STORAGE_KEY, JSON.stringify({ secretValue }, null, 2))
  }, [entraSettings])

  const setEntraSetting = (key: keyof EntraSettings, value: string) => {
    setEntraSettings((current) => ({ ...current, [key]: value.trim() }))
  }

  const clearEntraSettings = () => {
    setEntraSettings(EMPTY)
  }

  return { entraSettings, setEntraSetting, clearEntraSettings }
}
