import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./tests/zos-loader.mjs', pathToFileURL('./'))

globalThis.__zeppPageDefinition = null

globalThis.Page = (definition) => {
  globalThis.__zeppPageDefinition = definition
  return definition
}
