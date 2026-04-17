/// <reference types="vite/client" />

declare const __APP_BUILD_ID__: string
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_BISHOP_LLM_ENDPOINT?: string
  readonly VITE_BISHOP_MODEL?: string
  readonly VITE_DEEPVAULT_DATA_MODE?: string
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  prompt: () => Promise<void> | void
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

declare module 'virtual:pwa-register/react' {
  import type { Dispatch, SetStateAction } from 'react'
  import type { RegisterSWOptions } from 'vite-plugin-pwa/types'

  export type { RegisterSWOptions }

  export function useRegisterSW(_options?: RegisterSWOptions): {
    needRefresh: [boolean, Dispatch<SetStateAction<boolean>>]
    offlineReady: [boolean, Dispatch<SetStateAction<boolean>>]
    updateServiceWorker: (_reloadPage?: boolean) => Promise<void>
  }
}

declare module '*.css'
