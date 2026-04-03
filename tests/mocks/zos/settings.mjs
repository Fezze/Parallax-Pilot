const DEFAULT_LANGUAGE_CODE = 2

let languageCode = DEFAULT_LANGUAGE_CODE

export function getLanguage() {
  return languageCode
}

export function __setLanguage(nextLanguageCode = DEFAULT_LANGUAGE_CODE) {
  languageCode = nextLanguageCode
}

export function __resetLanguage() {
  languageCode = DEFAULT_LANGUAGE_CODE
}
