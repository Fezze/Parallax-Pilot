import { resolve as pathResolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const mockFiles = {
  '@zos/ble': 'tests/mocks/zos/ble.mjs',
  '@zos/device': 'tests/mocks/zos/device.mjs',
  '@zos/fetch': 'tests/mocks/zos/fetch.mjs',
  '@zos/router': 'tests/mocks/zos/router.mjs',
  '@zos/ui': 'tests/mocks/zos/ui.mjs',
  '@zos/utils': 'tests/mocks/zos/utils.mjs',
  '@zos/interaction': 'tests/mocks/zos/interaction.mjs',
  '@zos/sensor': 'tests/mocks/zos/sensor.mjs',
  '@zos/storage': 'tests/mocks/zos/storage.mjs',
  '@zos/settings': 'tests/mocks/zos/settings.mjs',
  '@zos/timer': 'tests/mocks/zos/timer.mjs',
  '@zos/display': 'tests/mocks/zos/display.mjs',
}

export async function resolve(specifier, context, nextResolve) {
  if (mockFiles[specifier]) {
    return {
      shortCircuit: true,
      url: pathToFileURL(pathResolve(process.cwd(), mockFiles[specifier])).href,
    }
  }

  return nextResolve(specifier, context)
}
