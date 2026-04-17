import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

const BUILD_QUERY_PARAM = '__build'
const FORCED_BUILD_STORAGE_KEY = 'deepvault_forced_build_id'

async function resetDevBrowserState() {
  if (!import.meta.env.DEV || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  } catch {
    // Ignore browser cleanup failures in local dev.
  }

  if (!('caches' in window)) {
    return
  }

  try {
    const cacheKeys = await caches.keys()
    await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)))
  } catch {
    // Ignore cache cleanup failures in local dev.
  }
}

async function ensureLatestBuild() {
  if (!import.meta.env.PROD || typeof window === 'undefined' || typeof fetch !== 'function') {
    return true
  }

  try {
    const response = await fetch(`/build-info.json?ts=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) {
      return true
    }

    const payload = await response.json() as { buildId?: string }
    const latestBuildId = payload.buildId
    if (!latestBuildId) {
      return true
    }

    const currentUrl = new URL(window.location.href)
    if (latestBuildId === __APP_BUILD_ID__) {
      const requestedBuildId = currentUrl.searchParams.get(BUILD_QUERY_PARAM)
      if (requestedBuildId === latestBuildId) {
        currentUrl.searchParams.delete(BUILD_QUERY_PARAM)
        window.history.replaceState(null, '', currentUrl.toString())
      }
      sessionStorage.removeItem(FORCED_BUILD_STORAGE_KEY)
      return true
    }

    const previousForcedBuildId = sessionStorage.getItem(FORCED_BUILD_STORAGE_KEY)
    if (previousForcedBuildId === latestBuildId) {
      return true
    }

    sessionStorage.setItem(FORCED_BUILD_STORAGE_KEY, latestBuildId)
    currentUrl.searchParams.set(BUILD_QUERY_PARAM, latestBuildId)
    window.location.replace(currentUrl.toString())
    return false
  } catch {
    return true
  }
}

void resetDevBrowserState().then(ensureLatestBuild).then((shouldRenderApp) => {
  if (!shouldRenderApp) {
    return
  }

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />)
})
