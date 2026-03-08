import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5175
  },
  // 使用默认的 public 目录
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    },
    copyPublicDir: true
  }
})
