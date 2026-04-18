import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserAuthError, InteractionRequiredAuthError, PublicClientApplication, type AccountInfo } from '@azure/msal-browser'

export interface HostedAuthConfig {
  enabled: boolean
  tenantId?: string | null
  clientId?: string | null
  scope?: string | null
}

export interface HostedAuthState {
  mode: string
  authConfig: HostedAuthConfig
  accessToken: string | null
  account: AccountInfo | null
  identityLabel: string | null
  isOperator: boolean
  error: string | null
  ready: boolean
  signOut: () => Promise<void>
}

interface ConfigModeResponse {
  mode?: string
  isOperator?: boolean
  auth?: {
    enabled?: boolean
    tenantId?: string | null
    clientId?: string | null
    scope?: string | null
  }
}

const DEFAULT_MODE = 'local'
const noopSignOut = async () => {}

const DISABLED_AUTH_STATE: HostedAuthState = {
  mode: DEFAULT_MODE,
  authConfig: { enabled: false },
  accessToken: null,
  account: null,
  identityLabel: null,
  isOperator: false,
  error: null,
  ready: true,
  signOut: noopSignOut,
}

function normalizeAuthConfig(value: ConfigModeResponse): HostedAuthConfig {
  return {
    enabled: value.auth?.enabled === true,
    tenantId: typeof value.auth?.tenantId === 'string' ? value.auth.tenantId : null,
    clientId: typeof value.auth?.clientId === 'string' ? value.auth.clientId : null,
    scope: typeof value.auth?.scope === 'string' ? value.auth.scope : null,
  }
}

function normalizeMode(value: ConfigModeResponse): string {
  return typeof value.mode === 'string' && value.mode ? value.mode : DEFAULT_MODE
}

function normalizeOperatorFlag(value: ConfigModeResponse): boolean {
  return value.isOperator === true
}

function buildIdentityLabel(account: AccountInfo | null): string | null {
  if (!account) {
    return null
  }
  return typeof account.name === 'string' && account.name
    ? account.name
    : typeof account.username === 'string' && account.username
      ? account.username
      : null
}

export function useHostedAuth(): HostedAuthState {
  const msalRef = useRef<PublicClientApplication | null>(null)
  const [state, setState] = useState<HostedAuthState>({
    mode: DEFAULT_MODE,
    authConfig: { enabled: false },
    accessToken: null,
    account: null,
    identityLabel: null,
    isOperator: false,
    error: null,
    ready: false,
    signOut: noopSignOut,
  })

  const signOut = useCallback(async () => {
    const msal = msalRef.current
    if (!msal) {
      return
    }

    const account = msal.getActiveAccount() || msal.getAllAccounts()[0] || undefined
    await msal.logoutRedirect({
      account,
      postLogoutRedirectUri: window.location.origin,
    })
  }, [])

  useEffect(() => {
    let active = true

    async function fetchRuntimeConfig(accessToken?: string): Promise<ConfigModeResponse> {
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
      const response = await fetch('/api/config/mode', { cache: 'no-store', headers })
      if (!response.ok) {
        throw new Error(`Failed to load worker mode config: ${response.status}`)
      }
      return response.json() as Promise<ConfigModeResponse>
    }

    async function initializeHostedAuth() {
      try {
        const payload = await fetchRuntimeConfig()
        const authConfig = normalizeAuthConfig(payload)
        const mode = normalizeMode(payload)
        if (!authConfig.enabled) {
          if (active) {
            setState({
              ...DISABLED_AUTH_STATE,
              mode,
              signOut,
            })
          }
          return
        }

        if (!authConfig.clientId || !authConfig.tenantId || !authConfig.scope) {
          if (active) {
            setState({
              mode,
              authConfig,
              accessToken: null,
              account: null,
              identityLabel: null,
              isOperator: false,
              error: 'Hosted auth is enabled but the worker auth config is incomplete.',
              ready: true,
              signOut,
            })
          }
          return
        }
        const scope = authConfig.scope

        const msal = new PublicClientApplication({
          auth: {
            clientId: authConfig.clientId,
            authority: `https://login.microsoftonline.com/${authConfig.tenantId}`,
            redirectUri: window.location.origin,
          },
          cache: {
            cacheLocation: 'sessionStorage',
          },
        })
        msalRef.current = msal

        await msal.initialize()
        const redirectResult = await msal.handleRedirectPromise()
        const redirectAccount = redirectResult?.account || null
        if (redirectAccount) {
          msal.setActiveAccount(redirectAccount)
        }

        let account = redirectAccount || msal.getActiveAccount() || msal.getAllAccounts()[0] || null
        if (!account) {
          try {
            const silentResult = await msal.ssoSilent({
              scopes: [scope],
              redirectUri: window.location.origin,
            })
            account = silentResult.account
            if (account) {
              msal.setActiveAccount(account)
            }
            if (active) {
              const runtimePayload = await fetchRuntimeConfig(silentResult.accessToken)
              setState({
                mode: normalizeMode(runtimePayload),
                authConfig,
                accessToken: silentResult.accessToken,
                account,
                identityLabel: buildIdentityLabel(account),
                isOperator: normalizeOperatorFlag(runtimePayload),
                error: null,
                ready: true,
                signOut,
              })
            }
            return
          } catch (error) {
            if (error instanceof BrowserAuthError || error instanceof InteractionRequiredAuthError || error instanceof Error) {
              await msal.loginRedirect({
                scopes: [scope],
                redirectUri: window.location.origin,
              })
              return
            }
            throw error
          }
        }

        const tokenResult = await msal.acquireTokenSilent({
          scopes: [scope],
          account,
        }).catch(async () => {
          await msal.acquireTokenRedirect({
            scopes: [scope],
            account,
            redirectUri: window.location.origin,
          })
          return null
        })

        if (!tokenResult || !active) {
          return
        }

        const runtimePayload = await fetchRuntimeConfig(tokenResult.accessToken)
        setState({
          mode: normalizeMode(runtimePayload),
          authConfig,
          accessToken: tokenResult.accessToken,
          account: tokenResult.account || account,
          identityLabel: buildIdentityLabel(tokenResult.account || account),
          isOperator: normalizeOperatorFlag(runtimePayload),
          error: null,
          ready: true,
          signOut,
        })
      } catch (error) {
        if (!active) {
          return
        }

        setState({
          mode: DEFAULT_MODE,
          authConfig: { enabled: false },
          accessToken: null,
          account: null,
          identityLabel: null,
          isOperator: false,
          error: error instanceof Error ? error.message : 'Hosted auth initialization failed.',
          ready: true,
          signOut,
        })
      }
    }

    void initializeHostedAuth()
    return () => {
      active = false
      msalRef.current = null
    }
  }, [signOut])

  return state
}
