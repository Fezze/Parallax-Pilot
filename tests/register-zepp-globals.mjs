import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./tests/zos-loader.mjs', pathToFileURL('./'))

globalThis.__zeppPageDefinition = null
globalThis.__zeppAppSettingsDefinition = null
globalThis.__zeppAppSideServiceDefinition = null
globalThis.__zeppAppDefinition = null

globalThis.Page = (definition) => {
  globalThis.__zeppPageDefinition = definition
  return definition
}

globalThis.AppSettingsPage = (definition) => {
  globalThis.__zeppAppSettingsDefinition = definition
  return definition
}

globalThis.AppSideService = (definition) => {
  globalThis.__zeppAppSideServiceDefinition = definition
  return definition
}

globalThis.App = (definition) => {
  globalThis.__zeppAppDefinition = definition
  return definition
}
