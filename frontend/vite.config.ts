import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Custom plugin: plotly.js v3 does require('buffer/') which Rolldown (Vite 8)
// cannot resolve in browser builds.  We intercept it with a virtual module
// that re-exports the global Buffer (always available in modern browsers via
// the Web Crypto / Node-compat layer, and also in Vite's dev transform).
function bufferPolyfill(): Plugin {
  const VIRTUAL = '\0buffer-polyfill'
  return {
    name: 'buffer-polyfill',
    resolveId(id) {
      // Intercept bare 'buffer' AND the trailing-slash form 'buffer/'
      if (id === 'buffer/' || id === 'buffer') return VIRTUAL
      return null
    },
    load(id) {
      if (id === VIRTUAL) {
        // Provide the Buffer shim inline; no external npm package required.
        return `
const Buf = globalThis.Buffer ?? (() => {
  // Minimal shim: delegate to Uint8Array for the tiny subset plotly uses
  function Buffer(arg, enc) {
    if (typeof arg === 'number') return new Uint8Array(arg);
    if (typeof arg === 'string') {
      const te = new TextEncoder();
      return te.encode(arg);
    }
    return new Uint8Array(arg);
  }
  Buffer.from = (a, enc) => {
    if (typeof a === 'string') {
      if (enc === 'base64') {
        const bin = atob(a);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        return buf;
      }
      return new TextEncoder().encode(a);
    }
    return new Uint8Array(a);
  };
  Buffer.isBuffer = (b) => b instanceof Uint8Array;
  Buffer.alloc = (n) => new Uint8Array(n);
  Buffer.allocUnsafe = (n) => new Uint8Array(n);
  Buffer.concat = (bufs) => {
    const total = bufs.reduce((s, b) => s + b.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const b of bufs) { out.set(b, off); off += b.length; }
    return out;
  };
  return Buffer;
})();

export { Buf as Buffer };
export default { Buffer: Buf };
`
      }
      return null
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), bufferPolyfill()],

  define: {
    // Some plotly internals also reference 'global'
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
