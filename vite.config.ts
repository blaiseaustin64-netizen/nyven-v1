import { defineConfig, type Plugin, type ResolvedConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SW_PLACEHOLDER = '__NYVEN_BUILD_ID__'

/**
 * Gives public/sw.js a unique cache name on every build.
 * Build: after the bundle is written, replaces __NYVEN_BUILD_ID__ in dist/sw.js
 *        with `<base36 timestamp>-<hash of the built file names + index.html>`.
 * Dev:   serves /sw.js with the id "dev" so the placeholder never leaks.
 */
function nyvenSwVersion(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'nyven-sw-version',
    configResolved(c) {
      config = c
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.split('?')[0] === '/sw.js') {
          try {
            const src = readFileSync(resolve(config.root, 'public/sw.js'), 'utf8')
            res.setHeader('Content-Type', 'application/javascript')
            res.setHeader('Cache-Control', 'no-cache')
            res.end(src.split(SW_PLACEHOLDER).join('dev'))
            return
          } catch {
            /* fall through to the default handler */
          }
        }
        next()
      })
    },
    closeBundle() {
      if (config.command !== 'build') return
      const outDir = resolve(config.root, config.build.outDir)
      const swPath = join(outDir, 'sw.js')
      if (!existsSync(swPath)) return
      const src = readFileSync(swPath, 'utf8')
      if (!src.includes(SW_PLACEHOLDER)) {
        throw new Error(`[nyven-sw-version] ${SW_PLACEHOLDER} not found in ${swPath}; cache would not be versioned`)
      }
      const hash = createHash('sha1')
      const assetsDir = join(outDir, 'assets')
      if (existsSync(assetsDir)) hash.update(readdirSync(assetsDir).sort().join('|'))
      const indexPath = join(outDir, 'index.html')
      if (existsSync(indexPath)) hash.update(readFileSync(indexPath))
      const id = `${Date.now().toString(36)}-${hash.digest('hex').slice(0, 8)}`
      writeFileSync(swPath, src.split(SW_PLACEHOLDER).join(id))
      config.logger.info(`[nyven-sw-version] sw.js cache id: nyven-shell-${id}`)
    },
  }
}

export default defineConfig({
  plugins: [react(), nyvenSwVersion()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
