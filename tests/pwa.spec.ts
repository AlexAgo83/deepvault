import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

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
