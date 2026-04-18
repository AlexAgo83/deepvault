import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

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

vi.mock('@azure/msal-browser', () => {
  class MockBrowserAuthError extends Error {}
  class MockInteractionRequiredAuthError extends Error {}

  return {
    BrowserAuthError: MockBrowserAuthError,
    InteractionRequiredAuthError: MockInteractionRequiredAuthError,
    PublicClientApplication: class {
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

function createHostedFetchMock(isOperator: boolean) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)

    if (url.includes('/api/config/mode')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          mode: 'hosted',
          isOperator,
          auth: {
            enabled: true,
            tenantId: 'tenant-id',
            clientId: 'client-id',
            scope: 'api://client-id/Nexus.Access',
          },
        }),
      })
    }

    if (url.includes('/api/corpus')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          schemaVersion: '1.1',
          defaultUserRole: 'analyst',
          providers: [],
          sites: [],
          syncRuns: [],
          documents: [],
        }),
      })
    }

    throw new Error(`Unexpected fetch: ${url} ${JSON.stringify(init ?? {})}`)
  })
}

describe('hosted mode UI', () => {
  beforeEach(() => {
    initializeMock.mockResolvedValue(undefined)
    handleRedirectPromiseMock.mockResolvedValue(null)
    setActiveAccountMock.mockReset()
    getActiveAccountMock.mockReturnValue(null)
    getAllAccountsMock.mockReturnValue([])
    ssoSilentMock.mockResolvedValue({
      accessToken: 'hosted-access-token',
      account: { username: 'alice@contoso.com', name: 'Alice Martin' },
    })
    loginRedirectMock.mockResolvedValue(undefined)
    logoutRedirectMock.mockResolvedValue(undefined)
    acquireTokenSilentMock.mockReset()
    acquireTokenRedirectMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
    sessionStorage.clear()
    window.location.hash = ''
  })

  it('hides operator-only surfaces for hosted team members and exposes session identity', async () => {
    vi.stubGlobal('fetch', createHostedFetchMock(false))
    const user = userEvent.setup()

    render(<App />)

    await waitFor(() => expect(screen.getByText('Alice Martin')).toBeInTheDocument())
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Artifacts' })).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Settings' }))

    expect(screen.getByText('Shared')).toBeInTheDocument()
    expect(screen.getByText('Signed in as Alice Martin.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'AI providers' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('OpenAI API key')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Knowledge' }))
    await user.click(screen.getByRole('button', { name: 'Operations' }))

    expect(screen.queryByRole('button', { name: 'Ingest' })).not.toBeInTheDocument()
    expect(screen.getByText('Hosted team members can review status and history here, but only operators can launch knowledge jobs.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(logoutRedirectMock).toHaveBeenCalledTimes(1)
  })

  it('keeps artifacts and job controls visible for hosted operators', async () => {
    vi.stubGlobal('fetch', createHostedFetchMock(true))
    const user = userEvent.setup()

    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Artifacts' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Knowledge' }))
    await user.click(screen.getByRole('button', { name: 'Operations' }))

    expect(screen.getByRole('button', { name: 'Ingest' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })
})
