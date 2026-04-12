import { useEffect, useState } from 'react'

export const ENTRA_SETTINGS_STORAGE_KEY = 'deepvault_entra_settings'

export interface EntraSettings {
  appId: string
  tenantId: string
  secretValue: string
  sites: string
  siteNames: string
}

const EMPTY: EntraSettings = {
  appId: '',
  tenantId: '',
  secretValue: '',
  sites: '',
  siteNames: '',
}

function readEntraSettings(): EntraSettings {
  if (typeof window === 'undefined') return EMPTY

  const raw = window.localStorage.getItem(ENTRA_SETTINGS_STORAGE_KEY)
  if (!raw) return EMPTY

  try {
    const parsed = JSON.parse(raw) as Partial<EntraSettings>
    return {
      appId: parsed.appId?.trim() || '',
      tenantId: parsed.tenantId?.trim() || '',
      secretValue: parsed.secretValue?.trim() || '',
      sites: parsed.sites?.trim() || '',
      siteNames: parsed.siteNames?.trim() || '',
    }
  } catch {
    return EMPTY
  }
}

export function useEntraSettings() {
  const [entraSettings, setEntraSettings] = useState<EntraSettings>(() => readEntraSettings())

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(ENTRA_SETTINGS_STORAGE_KEY, JSON.stringify(entraSettings, null, 2))
  }, [entraSettings])

  const setEntraSetting = (key: keyof EntraSettings, value: string) => {
    setEntraSettings((current) => ({ ...current, [key]: value.trim() }))
  }

  const clearEntraSettings = () => {
    setEntraSettings(EMPTY)
  }

  return { entraSettings, setEntraSetting, clearEntraSettings }
}
