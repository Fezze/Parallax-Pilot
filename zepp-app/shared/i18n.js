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
    tiltCalibrationLabel: 'CALIBRATE',
    tiltCalibrationReady: 'READY',
    tiltCalibrationMissing: 'NOT SET',
    tiltCalibrationTitle: 'TILT CALIBRATION',
    tiltCalibrationLogs: 'CALIBRATION LOGS',
    tiltCalibrationGuide: 'FOLLOW THE MOTION PROMPTS',
    tiltCalibrationCenter: 'HOLD CENTER',
    tiltCalibrationDown: 'TILT DOWN',
    tiltCalibrationUp: 'TILT UP',
    tiltCalibrationDone: 'CALIBRATION SAVED',
    tiltCalibrationStep: 'STEP {current} / {total}',
    tiltCalibrationLive: 'LIVE Y {value}',
    tiltCalibrationWaitingStill: 'HOLD STILL {current} / {target}s',
    tiltCalibrationWaitingMove: 'MOVE AND STOP',
    tiltCalibrationWaitingSettle: 'STOP AND HOLD {current} / {target}s',
    tiltCalibrationDebug: 'DEBUG',
    tiltCalibrationOffset: 'OFFSET',
    tiltCalibrationNoise: 'NOISE',
    tiltCalibrationDownMetric: 'DOWN',
    tiltCalibrationUpMetric: 'UP',
    tiltCalibrationStart: 'START',
    back: 'BACK',
    play: 'PLAY',
    prev: 'PREVIOUS',
    next: 'NEXT',
    runOver: 'RUN OVER',
    recentRuns: 'RECENT RUNS',
    noRunsSavedYet: 'NO RUNS SAVED YET',
    controlMode_tilt: 'TILT',
    controlMode_touch: 'TOUCH',
    controlMode_swipe: 'SWIPE',
    wristSide_left: 'LEFT',
    wristSide_right: 'RIGHT',
  },
  'pl-PL': {
    homeTitle: 'PARALLAX PILOT',
    homeSubtitle: 'OMIJAJ ASTEROIDY',
    startRun: 'START',
    settings: 'USTAWIENIA',
    scoreboard: 'WYNIKI',
    homeMeta: 'CZAS {timeScale}x  ILO\u015a\u0106 {spawnMultiplier}x',
    savedRuns: 'WYNIKI: {count}',
    tapToChange: 'DOTKNIJ, BY ZMIENI\u0106',
    controlLabel: 'STEROWANIE',
    wristLabel: 'R\u0118KA',
    timeLabel: 'CZAS',
    spawnLabel: 'ILO\u015a\u0106',
    tiltLabel: 'PRZECHYLENIE',
    tiltCalibrationLabel: 'KALIBRACJA',
    tiltCalibrationReady: 'GOTOWA',
    tiltCalibrationMissing: 'BRAK',
    tiltCalibrationTitle: 'KALIBRACJA',
    tiltCalibrationLogs: 'LOGI KALIBRACJI',
    tiltCalibrationGuide: 'POD\u0104\u017bAJ ZA RUCHEM',
    tiltCalibrationCenter: 'TRZYMAJ NA \u015aRODKU',
    tiltCalibrationDown: 'PRZECHYL W D\u00d3\u0141',
    tiltCalibrationUp: 'PRZECHYL W G\u00d3R\u0118',
    tiltCalibrationDone: 'ZAPISANO',
    tiltCalibrationStep: 'KROK {current} / {total}',
    tiltCalibrationLive: 'Y NA \u017bYWO {value}',
    tiltCalibrationWaitingStill: 'BEZ RUCHU {current} / {target}s',
    tiltCalibrationWaitingMove: 'PORUSZ I ZATRZYMAJ',
    tiltCalibrationWaitingSettle: 'ZATRZYMAJ {current} / {target}s',
    tiltCalibrationDebug: 'DEBUG',
    tiltCalibrationOffset: 'OFFSET',
    tiltCalibrationNoise: 'SZUM',
    tiltCalibrationDownMetric: 'D\u00d3\u0141',
    tiltCalibrationUpMetric: 'G\u00d3RA',
    tiltCalibrationStart: 'START',
    back: 'MENU',
    play: 'GRAJ',
    prev: 'POPRZEDNIA',
    next: 'NAST\u0118PNA',
    runOver: 'KONIEC',
    recentRuns: 'OSTATNIE WYNIKI',
    noRunsSavedYet: 'BRAK WYNIK\u00d3W',
    controlMode_tilt: 'PRZECHYLENIE',
    controlMode_touch: 'DOTYK',
    controlMode_swipe: 'PRZESUWANIE',
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
  } catch (_error) {
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
