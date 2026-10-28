import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `@tensorflow-models/face-detection` imports the MediaPipe solution at
      // module scope even though this application only ever uses its TF.js
      // runtime. Without this alias every assessment build either bundles
      // several megabytes of unused WASM or fails to resolve a peer dependency.
      // The stand-in documents itself and throws if that runtime is ever chosen.
      '@mediapipe/face_detection': fileURLToPath(
        new URL('./src/features/exams/mediapipe-face-detection-stub.ts', import.meta.url)
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Host development reaches the API on localhost; the dev Compose stack
        // runs the server in a container, where the API is the `backend`
        // service, so the target is overridable rather than hard-coded.
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
