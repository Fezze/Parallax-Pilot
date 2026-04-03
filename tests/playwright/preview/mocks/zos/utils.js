function noop() {}

export const log = {
  getLogger() {
    return {
      info: noop,
      warn: noop,
      debug: noop,
      error: noop,
    }
  },
}
