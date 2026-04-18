import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHostedAuth } from '../src/hooks/useHostedAuth'

const initializeMock = vi.fn()
const handleRedirectPromiseMock = vi.fn()
const setActiveAccountMock = vi.fn()
const getActiveAccountMock = vi.fn()
const getAllAccountsMock = vi.fn()
const ssoSilentMock = vi.fn()
const loginRedirectMock = vi.fn()
const logoutRedirectMock = vi.fn()
const acquireTokenSilentMock = vi.fn()
const acquireTokenRedirectMock = vi.fn()
const constructorMock = vi.fn()

vi.mock('@azure/msal-browser', () => {
  class MockBrowserAuthError extends Error {}
  class MockInteractionRequiredAuthError extends Error {}

  return {
    BrowserAuthError: MockBrowserAuthError,
    InteractionRequiredAuthError: MockInteractionRequiredAuthError,
    PublicClientApplication: class {
      constructor(config: unknown) {
        constructorMock(config)
      }

      initialize = initializeMock
      handleRedirectPromise = handleRedirectPromiseMock
      setActiveAccount = setActiveAccountMock
      getActiveAccount = getActiveAccountMock
      getAllAccounts = getAllAccountsMock
      ssoSilent = ssoSilentMock
      loginRedirect = loginRedirectMock
      logoutRedirect = logoutRedirectMock
      acquireTokenSilent = acquireTokenSilentMock
      acquireTokenRedirect = acquireTokenRedirectMock
    },
  }
})

describe('useHostedAuth', () => {
  beforeEach(() => {
    initializeMock.mockResolvedValue(undefined)
    handleRedirectPromiseMock.mockResolvedValue(null)
    setActiveAccountMock.mockReset()
    getActiveAccountMock.mockReturnValue(null)
    getAllAccountsMock.mockReturnValue([])
    ssoSilentMock.mockReset()
    loginRedirectMock.mockResolvedValue(undefined)
    logoutRedirectMock.mockResolvedValue(undefined)
    acquireTokenSilentMock.mockReset()
    acquireTokenRedirectMock.mockResolvedValue(undefined)
    constructorMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('obtains an access token silently when hosted auth is enabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        mode: 'hosted',
        isOperator: true,
        auth: {
          enabled: true,
          tenantId: 'tenant-id',
          clientId: 'client-id',
          scope: 'api://client-id/Nexus.Access',
        },
      }),
    }))
    ssoSilentMock.mockResolvedValue({
      accessToken: 'hosted-access-token',
      account: { username: 'alice@contoso.com' },
    })

    const { result } = renderHook(() => useHostedAuth())

    await waitFor(() => expect(result.current.ready).toBe(true))

    expect(result.current.accessToken).toBe('hosted-access-token')
    expect(result.current.mode).toBe('hosted')
    expect(result.current.isOperator).toBe(true)
    expect(result.current.account?.username).toBe('alice@contoso.com')
    expect(loginRedirectMock).not.toHaveBeenCalled()
  })

  it('falls back to redirect when silent SSO cannot complete', async () => {
    const { InteractionRequiredAuthError } = await import('@azure/msal-browser')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        mode: 'hosted',
        auth: {
          enabled: true,
          tenantId: 'tenant-id',
          clientId: 'client-id',
          scope: 'api://client-id/Nexus.Access',
        },
      }),
    }))
    ssoSilentMock.mockRejectedValue(new InteractionRequiredAuthError('interaction_required'))

    renderHook(() => useHostedAuth())

    await waitFor(() => expect(loginRedirectMock).toHaveBeenCalledTimes(1))
  })
})
