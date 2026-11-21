import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/react-markdown/') || id.includes('node_modules/remark-gfm/')) {
            return 'vendor-markdown'
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/chat': 'http://127.0.0.1:8000',
      '/threads': 'http://127.0.0.1:8000',
      '/settings': 'http://127.0.0.1:8000',
      '/providers': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
      '/ag-ui': 'http://127.0.0.1:8000',
      '/copilotkit': 'http://127.0.0.1:8000',
      '/generative_ui': 'http://127.0.0.1:8000',
      '/a2ui': 'http://127.0.0.1:8000',
      '/auth': 'http://127.0.0.1:8000',
      '/marketplace': 'http://127.0.0.1:8000',
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
