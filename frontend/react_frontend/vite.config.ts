import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'React Progressive Web App',
        short_name: 'ReactPWA',
        description: 'A high-performance React application built as a PWA',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any' // "any maskable" changed to "any" to prevent strict TS errors, or add a separate object for maskable
          }
        ]
      }
    })
  ]
})
//For this configuration to work without deployment issues, 
// you must ensure your image assets exist in the correct location:
// Place your icons (pwa-192x192.png, pwa-512x512.png) and assets inside the frontend/react_frontend/public/ folder.
// If you do not have those exact image files yet, the app will still run locally, 
// but the browser will fail to fetch the icons when you attempt to install the PWA.