// npm run local: persistent test data, same-origin APIs, loopback only.
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { fixtureDb } from './fixture-db.mjs'
import { localApi } from './local-api.mjs'

const host = '127.0.0.1'
const port = Number(process.env.STORY_TEST_PORT ?? 5174)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port')
const origin = 'http://' + host + ':' + port
const folder = resolve(process.cwd(), 'output')
await mkdir(folder, { recursive: true })
const dataDirectory = port === 5174 ? 'local-preview.pg' : 'local-preview-' + port + '.pg'
const db = await fixtureDb(resolve(folder, dataDirectory))
let server
try {
  server = await createServer({
    mode: 'local-book',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(origin),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_storybook_local_only'),
    },
    server: { host, port, strictPort: true },
    plugins: [{
      name: 'storybook-loopback-test-api',
      configureServer(vite) {
        vite.middlewares.use(localApi(db, origin))
      },
    }],
  })
  await server.listen()
  server.printUrls()
  console.log('Local test mode. Test accounts: yangyang@example.test / wanwan@example.test. Password: story-local-only')
} catch (error) {
  await db.close()
  throw error
}

let closing = false
async function close() {
  if (closing) return
  closing = true
  await server.close()
  await db.close()
}
process.once('SIGINT', close)
process.once('SIGTERM', close)
