import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

export function publicShell(): Plugin {
  return {
    name: 'storybook-public-shell',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, output) {
      const built = Object.keys(output).filter(name => name.startsWith('assets/')).sort()
      const assets = ['index.html', 'manifest.webmanifest', 'icons/storybook-192.png', 'icons/storybook-512.png', ...built]
      const worker = readFileSync(new URL('./shell-worker.js', import.meta.url), 'utf8')
      const index = output['index.html']
      const html = index?.type === 'asset' ? index.source : ''
      const version = createHash('sha256').update(worker).update(assets.join('\n')).update(html).digest('hex').slice(0, 12)
      this.emitFile({
        type: 'asset', fileName: 'sw.js',
        source: worker.replace('__SHELL_ASSETS__', JSON.stringify(assets)).replace('__SHELL_VERSION__', JSON.stringify(version)),
      })
    },
  }
}
