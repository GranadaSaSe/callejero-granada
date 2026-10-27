import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import paquete from './package.json' with { type: 'json' }

export default defineConfig({
  // La app se publica en https://granadasase.github.io/callejero-granada/
  base: '/callejero-granada/',
  define: {
    __VERSION__: JSON.stringify(paquete.version),
  },
  // La librería de mapas ocupa ~1 MB; solo se descarga al abrir el mapa, así que no hace falta el aviso
  build: { chunkSizeWarningLimit: 1200 },
  plugins: [
    VitePWA({
      // La app se actualiza sola cuando se publica una versión nueva
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      workbox: {
        // Todo lo necesario para usar la app sin internet: código, datos de Granada y letras del mapa
        globPatterns: ['**/*.{js,mjs,css,html,json,pbf,png,svg,ico}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
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
