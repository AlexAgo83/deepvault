import { renderHook, act } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PROVIDER_SECRETS_STORAGE_KEY, useProviderSecrets } from '../src/hooks/useProviderSecrets'

describe('useProviderSecrets', () => {
  afterEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  it('migrates legacy localStorage secrets into sessionStorage', () => {
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
    expect(localStorage.getItem(PROVIDER_SECRETS_STORAGE_KEY)).toBeNull()
    expect(JSON.parse(sessionStorage.getItem(PROVIDER_SECRETS_STORAGE_KEY) || '{}')).toEqual({
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
    expect(JSON.parse(sessionStorage.getItem(PROVIDER_SECRETS_STORAGE_KEY) || '{}')).toEqual({
      openaiApiKey: '',
      geminiApiKey: '',
      anthropicApiKey: '',
    })
  })
})
