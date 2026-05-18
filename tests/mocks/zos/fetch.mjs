const responseQueue = []
const requests = []

export async function fetch(request) {
  requests.push(request)

  if (responseQueue.length === 0) {
    throw new Error(`No mock fetch response queued for ${request?.method || 'GET'} ${request?.url || ''}`)
  }

  const next = responseQueue.shift()
  if (next instanceof Error) {
    throw next
  }

  return {
    status: next.status ?? 200,
    body: typeof next.body === 'undefined' ? '' : next.body,
  }
}

export function __queueFetchResponse(response) {
  responseQueue.push(response)
}

export function __getFetchRequests() {
  return requests.slice()
}

export function __resetFetch() {
  responseQueue.length = 0
  requests.length = 0
}