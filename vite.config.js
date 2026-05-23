import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const assistantFromEnv =
    env.VITE_ASSISTANT_API_BASE_URL || process.env.VITE_ASSISTANT_API_BASE_URL || ''
  const selfHostedSameOrigin =
    env.VITE_SELF_HOSTED_SAME_ORIGIN === '1' ||
    env.VITE_SELF_HOSTED_SAME_ORIGIN === 'true' ||
    process.env.VITE_SELF_HOSTED_SAME_ORIGIN === '1' ||
    process.env.VITE_SELF_HOSTED_SAME_ORIGIN === 'true'
  const skipCheck =
    process.env.SKIP_ASSISTANT_ENV_CHECK === '1' || process.env.SKIP_ASSISTANT_ENV_CHECK === 'true'

  if (mode === 'production' && !selfHostedSameOrigin && !skipCheck && !String(assistantFromEnv).trim()) {
    throw new Error(
      '[vite] Production build requires VITE_ASSISTANT_API_BASE_URL (https://your-assistant-host, no trailing slash). ' +
        'Set it in Vercel / CI env, enable VITE_SELF_HOSTED_SAME_ORIGIN=1 for bundled nginx same-origin deployment, or use SKIP_ASSISTANT_ENV_CHECK=1 for a local production bundle test only.'
    )
  }

  return {
    plugins: [
      vue(),
      VitePWA({
        strategies: 'generateSW',
        injectRegister: false,
        registerType: 'prompt',
        manifest: false,
        includeAssets: [
          'favicon.svg',
          'pwa/icon-192.png',
          'pwa/icon-512.png',
          'pwa/icon-maskable-192.png',
          'pwa/apple-touch-icon.png'
        ],
        workbox: {
          cleanupOutdatedCaches: true,
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/ReadingPractice\/PDF\//],
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json,txt}'],
          globIgnores: [
            '**/*.map',
            'assistant-api.json',
            'assets/generated/**',
            'ReadingPractice/PDF/**',
            'assets/p1-*.js',
            'assets/p2-*.js',
            'assets/p3-*.js'
          ],
          runtimeCaching: [
            {
              urlPattern: ({ request, url }) =>
                request.destination === 'script'
                && /\/assets\/.+\.js$/i.test(url.pathname),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'app-js-chunks',
                cacheableResponse: {
                  statuses: [0, 200]
                },
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 30
                }
              }
            },
            {
              urlPattern: ({ request }) =>
                request.destination === 'style'
                || request.destination === 'worker',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'app-shell-static',
                cacheableResponse: {
                  statuses: [0, 200]
                },
                expiration: {
                  maxEntries: 48,
                  maxAgeSeconds: 60 * 60 * 24 * 30
                }
              }
            },
            {
              urlPattern: ({ url }) => url.pathname === '/assistant-api.json',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'assistant-public-config',
                networkTimeoutSeconds: 3,
                cacheableResponse: {
                  statuses: [0, 200]
                },
                expiration: {
                  maxEntries: 1,
                  maxAgeSeconds: 60 * 60 * 24
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-stylesheets',
                cacheableResponse: {
                  statuses: [0, 200]
                },
                expiration: {
                  maxEntries: 8,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                cacheableResponse: {
                  statuses: [0, 200]
                },
                expiration: {
                  maxEntries: 16,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                }
              }
            },
            {
              urlPattern: ({ request, url }) =>
                request.destination === 'image'
                && ['i.postimg.cc', 'i.ibb.co'].includes(url.hostname),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'remote-practice-diagrams',
                cacheableResponse: {
                  statuses: [0, 200]
                },
                expiration: {
                  maxEntries: 64,
                  maxAgeSeconds: 60 * 60 * 24 * 30
                }
              }
            }
          ]
        }
      })
    ],
    server: {
      // Listen on IPv4 + IPv6 loopback so both http://127.0.0.1:5175 and http://localhost:5175 work (Windows often bound ::1 only with host: 'localhost').
      host: true,
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
      host: true,
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
