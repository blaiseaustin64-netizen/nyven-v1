// Test-only loader: lets Node 22 run the Pages Functions TypeScript sources directly.
// Node strips types natively; this hook only adds the `.ts` extension to the project's
// extensionless relative imports (the Pages Functions code uses bundler-style resolution).
import { registerHooks } from 'node:module'

const hasExtension = /\.[cm]?[jt]sx?$/

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (err) {
      const relative = specifier.startsWith('./') || specifier.startsWith('../')
      if (relative && !hasExtension.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context)
      }
      throw err
    }
  },
})
