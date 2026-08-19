import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Forward API calls to the local 竞彩 backend (server/server.js)
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        // AI 分析可能调用慢速大模型（30-120s），代理必须等够久，否则会提前返回 502
        timeout: 180000,
      },
    },
  },
})
