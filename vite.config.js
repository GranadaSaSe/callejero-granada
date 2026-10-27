import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // La app se publica en https://granadasase.github.io/callejero-granada/
  base: '/callejero-granada/',
  plugins: [
    VitePWA({
      // La app se actualiza sola cuando se publica una versión nueva
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Callejero Granada',
        short_name: 'Callejero',
        description: 'Estudio del callejero de Granada para la oposición de Bomberos',
        lang: 'es',
        theme_color: '#b3261e',
        background_color: '#fbf8f6',
        display: 'standalone',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
