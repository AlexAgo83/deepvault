import { readFileSync } from 'node:fs'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
}

function createBeforeInstallPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const prompt = vi.fn().mockResolvedValue(undefined)
  const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent & {
    prompt: typeof prompt
  }

  Object.defineProperties(event, {
    platforms: { value: ['web'] },
    prompt: { value: prompt },
    userChoice: { value: Promise.resolve({ outcome, platform: 'web' }) },
  })

  return { event, prompt }
}

function setPwaRegisterState(needRefresh: boolean) {
  const mock = (globalThis as typeof globalThis & {
    __pwaRegisterSWMock?: {
      needRefresh: boolean
      offlineReady: boolean
      updateServiceWorker: ReturnType<typeof vi.fn>
    }
  }).__pwaRegisterSWMock

  if (!mock) {
    throw new Error('PWA register mock is not available')
  }

  mock.needRefresh = needRefresh
  mock.offlineReady = false
  mock.updateServiceWorker.mockClear()
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setPwaRegisterState(false)
})

describe('PWA manifest', () => {
  it('exposes the standalone manifest and square icons', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
      background_color: string
      display: string
      icons: Array<{ sizes: string; src: string; type: string }>
      name: string
      scope: string
      short_name: string
      start_url: string
      theme_color: string
    }

    expect(manifest).toMatchObject({
      name: 'DeepVault Nexus',
      short_name: 'Nexus',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#f5f3ef',
      theme_color: '#1d2733',
    })
    expect(manifest.icons).toEqual([
      { src: '/pwa-icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
      { src: '/pwa-icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
    ])
  })
})

describe('PWA install prompt', () => {
  it('shows the install button when beforeinstallprompt is captured and hides it after acceptance', async () => {
    const user = userEvent.setup()
    stubMatchMedia(false)
    render(<App />)

    const { event, prompt } = createBeforeInstallPromptEvent('accepted')
    await act(async () => {
      window.dispatchEvent(event)
    })

    const installButton = await screen.findByRole('button', { name: "Installer l'app" })
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: "Installer l'app" })).not.toBeInTheDocument()
    await user.click(installButton)

    expect(prompt).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('button', { name: "Installer l'app" })).not.toBeInTheDocument())
  })

  it('keeps the install button hidden when the app is already standalone', async () => {
    stubMatchMedia(true)
    render(<App />)

    expect(screen.queryByRole('button', { name: "Installer l'app" })).not.toBeInTheDocument()
  })

  it('keeps the install button hidden when beforeinstallprompt is unavailable', () => {
    stubMatchMedia(false)
    render(<App />)

    expect(screen.queryByRole('button', { name: "Installer l'app" })).not.toBeInTheDocument()
  })
})

describe('PWA update banner', () => {
  it('shows the update banner when a refresh is pending and hides it after update', async () => {
    const user = userEvent.setup()
    const mock = setPwaRegisterState(true)
    render(<App />)

    expect(await screen.findByText('Une nouvelle version est disponible')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mettre à jour' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mettre à jour' }))

    expect(mock.updateServiceWorker).toHaveBeenCalledWith(true)
    await waitFor(() => expect(screen.queryByText('Une nouvelle version est disponible')).not.toBeInTheDocument())
  })

  it('keeps the update banner informational instead of exposing a dismiss action', async () => {
    const user = userEvent.setup()
    setPwaRegisterState(true)
    render(<App />)

    await screen.findByText('Une nouvelle version est disponible')
    expect(screen.queryByRole('button', { name: 'Ignorer' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mettre à jour' }))
    await waitFor(() => expect(screen.queryByText('Une nouvelle version est disponible')).not.toBeInTheDocument())
  })

  it('keeps the banner hidden when no refresh is pending', () => {
    setPwaRegisterState(false)
    render(<App />)

    expect(screen.queryByText('Une nouvelle version est disponible')).not.toBeInTheDocument()
  })
})
