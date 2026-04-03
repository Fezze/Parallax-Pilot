const calls = []

export function push(payload) {
  calls.push({
    type: 'push',
    payload,
  })
}

export function replace(payload) {
  calls.push({
    type: 'replace',
    payload,
  })
}

export function back(payload) {
  calls.push({
    type: 'back',
    payload,
  })
}

export function __getRouterCalls() {
  return [...calls]
}

export function __resetRouter() {
  calls.length = 0
}
