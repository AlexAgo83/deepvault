import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

const pwaRegisterMock = {
  needRefresh: false,
  offlineReady: false,
  updateServiceWorker: vi.fn().mockResolvedValue(undefined),
}

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [pwaRegisterMock.needRefresh, vi.fn()],
    offlineReady: [pwaRegisterMock.offlineReady, vi.fn()],
    updateServiceWorker: pwaRegisterMock.updateServiceWorker,
  }),
}))

;(globalThis as typeof globalThis & { __pwaRegisterSWMock?: typeof pwaRegisterMock }).__pwaRegisterSWMock = pwaRegisterMock
