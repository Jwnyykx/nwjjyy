import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { publicShell } from './scripts/public-shell.ts'

export default defineConfig(({ command, mode }) => {
  if (command === 'build' && mode === 'local-book') throw new Error('The local test mode cannot be published.')
  if (command === 'build') {
    const env = loadEnv(mode, '.')
    const url = env.VITE_SUPABASE_URL?.trim()
    const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
    if (url || key) {
      const endpoint = url ? URL.parse(url) : null
      if (!endpoint || endpoint.protocol !== 'https:' || endpoint.pathname !== '/' ||
          endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
          ['localhost', '127.0.0.1'].includes(endpoint.hostname) ||
          !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key ?? '') || key === 'sb_publishable_storybook_local_only') {
        throw new Error('Supply a hosted Supabase HTTPS URL and its publishable key together.')
      }
    }
  }
  return {
    base: './',
    plugins: [react(), publicShell()],
    build: { target: 'es2022' },
    preview: { port: 4173, strictPort: true },
    server: {
      port: 5173,
      strictPort: true,
      watch: { ignored: ['**/output/**', '**/.playwright-cli/**'] },
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/output/**', '**/assets/private/**'] },
    },
  }
})
