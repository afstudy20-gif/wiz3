import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Custom plugin: plotly.js v3 does require('buffer/') which Rolldown (Vite 8)
// cannot resolve in browser builds. Intercept it and redirect to the 'buffer'
// npm package (already a transitive dep) via a virtual module.
function bufferPolyfill(): Plugin {
  const VIRTUAL = '\0buffer-polyfill'
  return {
    name: 'buffer-polyfill',
    resolveId(id) {
      if (id === 'buffer/' || id === 'buffer') return VIRTUAL
      return null
    },
    load(id) {
      if (id === VIRTUAL) {
        return [
          "import { Buffer as _Buffer } from 'buffer/index.js';",
          'export { _Buffer as Buffer };',
          'export default { Buffer: _Buffer };',
        ].join('\n')
      }
      return null
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), bufferPolyfill()],

  define: {
    global: 'globalThis',
  },

  optimizeDeps: {
    include: ["plotly.js", "react-plotly.js"],
  },

  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
