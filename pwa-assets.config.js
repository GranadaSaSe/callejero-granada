import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config'

// Genera los iconos de la app (Android, iPhone y pestaña del navegador) a partir de public/icon.svg
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...preset,
    maskable: { ...preset.maskable, padding: 0.2, resizeOptions: { background: '#b3261e' } },
    apple: { ...preset.apple, padding: 0.2, resizeOptions: { background: '#b3261e' } },
  },
  images: ['public/icon.svg'],
})
