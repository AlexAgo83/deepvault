import { renderHook, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PROVIDER_SECRETS_STORAGE_KEY, useProviderSecrets } from '../src/hooks/useProviderSecrets'

describe('useProviderSecrets', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
    localStorage.clear()
  })

  it('reads provider secrets from localStorage', () => {
    localStorage.setItem(PROVIDER_SECRETS_STORAGE_KEY, JSON.stringify({
      openaiApiKey: ' sk-openai ',
      geminiApiKey: ' sk-gemini ',
      anthropicApiKey: ' sk-anthropic ',
    }))

    const { result } = renderHook(() => useProviderSecrets())

    expect(result.current.providerSecrets).toEqual({
      openaiApiKey: 'sk-openai',
      geminiApiKey: 'sk-gemini',
      anthropicApiKey: 'sk-anthropic',
    })
    expect(JSON.parse(localStorage.getItem(PROVIDER_SECRETS_STORAGE_KEY) || '{}')).toEqual({
      openaiApiKey: 'sk-openai',
      geminiApiKey: 'sk-gemini',
      anthropicApiKey: 'sk-anthropic',
    })
  })

  it('migrates legacy sessionStorage secrets into localStorage', () => {
    sessionStorage.setItem(PROVIDER_SECRETS_STORAGE_KEY, JSON.stringify({
      openaiApiKey: ' sk-openai ',
      geminiApiKey: ' sk-gemini ',
      anthropicApiKey: ' sk-anthropic ',
    }))

    const { result } = renderHook(() => useProviderSecrets())

    expect(result.current.providerSecrets).toEqual({
      openaiApiKey: 'sk-openai',
      geminiApiKey: 'sk-gemini',
      anthropicApiKey: 'sk-anthropic',
    })
    expect(sessionStorage.getItem(PROVIDER_SECRETS_STORAGE_KEY)).toBeNull()
    expect(JSON.parse(localStorage.getItem(PROVIDER_SECRETS_STORAGE_KEY) || '{}')).toEqual({
      openaiApiKey: 'sk-openai',
      geminiApiKey: 'sk-gemini',
      anthropicApiKey: 'sk-anthropic',
    })
  })

  it('updates provider-specific keys and clears all secrets', () => {
    const { result } = renderHook(() => useProviderSecrets())

    act(() => {
      result.current.setApiKey('openai', '  openai-key  ')
      result.current.setApiKey('gemini', 'gemini-key')
      result.current.setApiKey('anthropic', 'anthropic-key')
    })

    expect(result.current.providerSecrets).toEqual({
      openaiApiKey: 'openai-key',
      geminiApiKey: 'gemini-key',
      anthropicApiKey: 'anthropic-key',
    })

    act(() => {
      result.current.clearProviderSecrets()
    })

    expect(result.current.providerSecrets).toEqual({
      openaiApiKey: '',
      geminiApiKey: '',
      anthropicApiKey: '',
    })
    expect(JSON.parse(localStorage.getItem(PROVIDER_SECRETS_STORAGE_KEY) || '{}')).toEqual({
      openaiApiKey: '',
      geminiApiKey: '',
      anthropicApiKey: '',
    })
  })

  it('falls back to empty secrets and logs when stored JSON is invalid', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(PROVIDER_SECRETS_STORAGE_KEY, '{invalid-json')

    const { result } = renderHook(() => useProviderSecrets())

    expect(result.current.providerSecrets).toEqual({
      openaiApiKey: '',
      geminiApiKey: '',
      anthropicApiKey: '',
    })
    expect(warnSpy).toHaveBeenCalled()
  })
})
