/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly ANTHROPIC_API_KEY?: string
  readonly VITE_BISHOP_LLM_ENDPOINT?: string
  readonly VITE_BISHOP_MODEL?: string
  readonly VITE_DEEPVAULT_DATA_MODE?: string
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  prompt: () => Promise<void> | void
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

declare module '*.css'
