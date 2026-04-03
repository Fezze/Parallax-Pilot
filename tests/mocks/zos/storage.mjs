let localMap = new Map()
let sessionMap = new Map()

class BaseStorage {
  constructor(mapGetter) {
    this.mapGetter = mapGetter
  }

  getItem(key, fallback = null) {
    const map = this.mapGetter()
    return map.has(key) ? map.get(key) : fallback
  }

  setItem(key, value) {
    this.mapGetter().set(key, value)
  }
}

export class LocalStorage extends BaseStorage {
  constructor() {
    super(() => localMap)
  }
}

export class SessionStorage extends BaseStorage {
  constructor() {
    super(() => sessionMap)
  }
}

export function __resetStorage() {
  localMap = new Map()
  sessionMap = new Map()
}

export function __seedLocalStorage(entries = {}) {
  localMap = new Map(Object.entries(entries))
}

export function __seedSessionStorage(entries = {}) {
  sessionMap = new Map(Object.entries(entries))
}

export function __readLocalStorage(key) {
  return localMap.get(key)
}

export function __readSessionStorage(key) {
  return sessionMap.get(key)
}
