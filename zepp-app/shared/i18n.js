import { getLanguage } from '@zos/settings'

const DEFAULT_LOCALE = 'en-US'

const LOCALE_BY_LANGUAGE_CODE = {
  2: 'en-US',
  9: 'pl-PL',
}

const STRINGS = {
  'en-US': {
    homeTitle: 'PARALLAX PILOT',
    homeSubtitle: 'DODGE THE ASTEROIDS',
    startRun: 'START RUN',
    settings: 'SETTINGS',
    scoreboard: 'SCOREBOARD',
    homeMeta: 'TIME {timeScale}x  SPAWN {spawnMultiplier}x',
    savedRuns: '{count} RUNS SAVED',
    tapToChange: 'TAP TO CHANGE',
    controlLabel: 'CONTROL',
    wristLabel: 'WRIST',
    timeLabel: 'TIME',
    spawnLabel: 'SPAWN',
    tiltLabel: 'TILT',
    back: 'BACK',
    play: 'PLAY',
    prev: 'PREV',
    next: 'NEXT',
    runOver: 'RUN OVER',
    recentRuns: 'RECENT RUNS',
    noRunsSavedYet: 'NO RUNS SAVED YET',
    controlMode_tilt: 'TILT',
    controlMode_touch: 'TOUCH',
    controlMode_swipe: 'SWIPE',
    controlMode_crown: 'ROTARY',
    wristSide_left: 'LEFT',
    wristSide_right: 'RIGHT',
  },
  'pl-PL': {
    homeTitle: 'PARALLAX PILOT',
    homeSubtitle: 'OMIJAJ ASTEROIDY',
    startRun: 'START',
    settings: 'USTAWIENIA',
    scoreboard: 'WYNIKI',
    homeMeta: 'CZAS {timeScale}x  ILOŚĆ {spawnMultiplier}x',
    savedRuns: 'WYNIKI: {count}',
    tapToChange: 'DOTKNIJ, BY ZMIENIĆ',
    controlLabel: 'STER.',
    wristLabel: 'RĘKA',
    timeLabel: 'CZAS',
    spawnLabel: 'ILOŚĆ',
    tiltLabel: 'PRZECH.',
    back: 'MENU',
    play: 'GRAJ',
    prev: 'POPRZ.',
    next: 'DALEJ',
    runOver: 'KONIEC',
    recentRuns: 'OSTATNIE WYNIKI',
    noRunsSavedYet: 'BRAK WYNIKÓW',
    controlMode_tilt: 'PRZECH.',
    controlMode_touch: 'DOTYK',
    controlMode_swipe: 'PRZES.',
    controlMode_crown: 'OBRÓT',
    wristSide_left: 'LEWA',
    wristSide_right: 'PRAWA',
  },
}

function replaceParams(template, params) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? params[key] : `{${key}}`
  )
}

export function getLocale() {
  try {
    const languageCode = getLanguage()
    return LOCALE_BY_LANGUAGE_CODE[languageCode] || DEFAULT_LOCALE
  } catch (error) {
    return DEFAULT_LOCALE
  }
}

export function t(key, params = {}) {
  const locale = getLocale()
  const template =
    STRINGS[locale]?.[key] ??
    STRINGS[DEFAULT_LOCALE]?.[key] ??
    key

  return replaceParams(template, params)
}
