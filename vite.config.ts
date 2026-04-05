import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: 'localhost',
    port: 5175,
    strictPort: true,
    // Same-origin /api in dev avoids CORS; frontend uses base URL '' when VITE_ASSISTANT_API_BASE_URL is unset.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        secure: false
      }
    }
  },
  // `vite preview` has no dev server proxy unless configured; without this, POST /api/* returns 404 from the static preview.
  preview: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  test: {
    environment: 'happy-dom',
    globals: true
  }
})
