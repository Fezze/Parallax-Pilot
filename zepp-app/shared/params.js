export function parseRouteParams(params, fallback = {}) {
  if (!params || typeof params !== 'string') {
    return fallback
  }

  try {
    return JSON.parse(params)
  } catch (_error) {
    return fallback
  }
}
