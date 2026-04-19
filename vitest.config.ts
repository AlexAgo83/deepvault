import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const APP_BUILD_ID = 'test-build'
const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      'virtual:pwa-register/react': `${ROOT_DIR}tests/mocks/virtual-pwa-register-react.ts`,
    },
  },
  define: {
    __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.4.0'),
  },
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    globals: true,
    pool: 'threads',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    exclude: ['tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/global.d.ts', 'src/main.tsx'],
      thresholds: {
        lines: 90,
        statements: 90,
        branches: 85,
        functions: 80,
      },
    },
  },
})
