const DEFAULT_LANGUAGE_CODE = 2

let languageCode = DEFAULT_LANGUAGE_CODE
let settingsEntries = new Map()
let changeListeners = []

class SettingsStorage {
  getItem(key) {
    return settingsEntries.get(key) ?? null
  }

  setItem(key, value) {
    settingsEntries.set(key, value)
  }

  removeItem(key) {
    settingsEntries.delete(key)
  }

  addListener(eventName, listener) {
    if (eventName === 'change') {
      changeListeners.push(listener)
    }
  }

  removeListener(eventName, listener) {
    if (eventName === 'change') {
      changeListeners = changeListeners.filter((candidate) => candidate !== listener)
    }
  }
}

export const settings = {
  settingsStorage: new SettingsStorage(),
}

export function getLanguage() {
  return languageCode
}

export function __setLanguage(nextLanguageCode = DEFAULT_LANGUAGE_CODE) {
  languageCode = nextLanguageCode
}

export function __resetLanguage() {
  languageCode = DEFAULT_LANGUAGE_CODE
}

export function __resetSettingsStorage(seed = {}) {
  settingsEntries = new Map(Object.entries(seed))
  changeListeners = []
  settings.settingsStorage = new SettingsStorage()
}

export async function __emitSettingsChange(key, newValue) {
  if (newValue === null || typeof newValue === 'undefined') {
    settings.settingsStorage.removeItem(key)
  } else {
    settings.settingsStorage.setItem(key, newValue)
  }

  for (const listener of [...changeListeners]) {
    await listener({ key, newValue })
  }
}
