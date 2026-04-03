import { getStorageMap } from './state.js'

class BaseStorage {
  constructor(kind) {
    this.kind = kind
  }

  getItem(key, fallback = null) {
    const map = getStorageMap(this.kind)
    return map.has(key) ? map.get(key) : fallback
  }

  setItem(key, value) {
    getStorageMap(this.kind).set(key, value)
  }
}

export class LocalStorage extends BaseStorage {
  constructor() {
    super('local')
  }
}

export class SessionStorage extends BaseStorage {
  constructor() {
    super('session')
  }
}
