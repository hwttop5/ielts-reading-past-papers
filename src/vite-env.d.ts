/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '*.json' {
  const value: any
  export default value
}

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  readonly VITE_ASSISTANT_API_BASE_URL?: string
  readonly VITE_BAIDU_TONGJI_ID?: string
  readonly MODE: string
  readonly DEV: boolean
  readonly PROD: boolean
  readonly SSR: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  _hmt?: Array<[string, ...Array<string | number | boolean | Record<string, unknown> | (() => boolean) | null | undefined>]>
}
