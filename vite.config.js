import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const assistantFromEnv =
    env.VITE_ASSISTANT_API_BASE_URL || process.env.VITE_ASSISTANT_API_BASE_URL || ''
  const skipCheck =
    process.env.SKIP_ASSISTANT_ENV_CHECK === '1' || process.env.SKIP_ASSISTANT_ENV_CHECK === 'true'

  if (mode === 'production' && !skipCheck && !String(assistantFromEnv).trim()) {
    throw new Error(
      '[vite] Production build requires VITE_ASSISTANT_API_BASE_URL (https://your-assistant-host, no trailing slash). ' +
        'Set it in Vercel / CI env, or use SKIP_ASSISTANT_ENV_CHECK=1 for a local production bundle test only.'
    )
  }

  return {
  plugins: [vue()],
  server: {
    host: 'localhost',
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        secure: false
      }
    }
  },
  preview: {
    host: 'localhost',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    },
    copyPublicDir: true
  },
  test: {
    environment: 'happy-dom',
    globals: true
  }
  }
})
