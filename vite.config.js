import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Forwards API calls to a remote backend during development, so the browser sees
// same-origin requests and the backend's CORS allow-list does not apply.
function createApiProxy(target) {
  const proxyOptions = {
    target,
    changeOrigin: true,
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'))
      // The dev server is plain HTTP, so production cookie flags would get the session cookie rejected.
      proxy.on('proxyRes', (proxyRes) => {
        const cookies = proxyRes.headers['set-cookie']
        if (cookies) {
          proxyRes.headers['set-cookie'] = cookies.map((cookie) => cookie
            .replace(/;\s*secure/gi, '')
            .replace(/;\s*samesite=none/gi, '; SameSite=Lax'))
        }
      })
    },
  }
  return { '/api': proxyOptions, '/uploads': proxyOptions }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const { VITE_API_PROXY_TARGET: proxyTarget } = loadEnv(mode, process.cwd())

  return {
    plugins: [react()],
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: proxyTarget ? createApiProxy(proxyTarget) : undefined,
      fs: {
        allow: ['..'],
      },
    },
  }
})
