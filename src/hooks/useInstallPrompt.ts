import { useEffect, useState } from 'react'

interface InstallPromptState {
  canInstall: boolean
  isStandalone: boolean
  install: () => Promise<void>
}

function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia('(display-mode: standalone)').matches
}

export function useInstallPrompt(): InstallPromptState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(() => isStandaloneDisplayMode())
  const [isInstalling, setIsInstalling] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const updateStandalone = () => {
      setIsStandalone(isStandaloneDisplayMode())
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent
      event.preventDefault()
      setDeferredPrompt(promptEvent)
      setIsStandalone(isStandaloneDisplayMode())
    }

    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setIsStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    const standaloneMedia = typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)') : null
    standaloneMedia?.addEventListener?.('change', updateStandalone)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      standaloneMedia?.removeEventListener?.('change', updateStandalone)
    }
  }, [])

  const install = async () => {
    if (!deferredPrompt || isInstalling) {
      return
    }

    const promptEvent = deferredPrompt
    setIsInstalling(true)
    await promptEvent.prompt()
    try {
      const choice = await promptEvent.userChoice
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null)
        setIsStandalone(true)
      }
    } finally {
      setIsStandalone(isStandaloneDisplayMode())
      setIsInstalling(false)
    }
  }

  return {
    canInstall: Boolean(deferredPrompt) && !isStandalone && !isInstalling,
    isStandalone,
    install,
  }
}
