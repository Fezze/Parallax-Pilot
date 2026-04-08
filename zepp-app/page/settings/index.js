import { getDeviceInfo, SCREEN_SHAPE_ROUND } from '@zos/device'
import { back, push, replace } from '@zos/router'
import {
  COLORS,
  FEATURE_FLAGS,
  ROUTES,
  SPAWN_MULTIPLIER_OPTIONS,
  TIME_SCALE_OPTIONS,
} from '../../shared/constants.js'
import { sanitizeControlMode } from '../../shared/device.js'
import {
  createActionButton,
  createLabel,
  createRoundButtonPair,
  hideStatusBar,
} from '../../shared/page-ui.js'
import { loadSettings, loadTiltCalibration, saveSettings } from '../../shared/storage.js'
import {
  cycleOption,
  formatSettingValue,
  getAvailableControlModes,
} from '../../shared/view-models.js'
import { t } from '../../shared/i18n.js'

function updateSetting(key, nextValue) {
  const settings = loadSettings()
  saveSettings({
    ...settings,
    [key]: nextValue,
  })
  replace({ url: ROUTES.SETTINGS })
}

Page({
  build() {
    hideStatusBar()

    const deviceInfo = getDeviceInfo()
    const loadedSettings = loadSettings()
    const settings = {
      ...loadedSettings,
      controlMode: sanitizeControlMode(loadedSettings.controlMode),
    }

    if (settings.controlMode !== loadedSettings.controlMode) {
      saveSettings(settings)
    }

    const { width, height } = deviceInfo
    const isRound = deviceInfo.screenShape === SCREEN_SHAPE_ROUND
    const pad = Math.round(width * 0.07)
    const fullWidth = width - pad * 2
    const rowHeight = isRound ? Math.round(Math.min(52, height * 0.105)) : Math.round(Math.min(42, height * 0.09))
    const rowGap = isRound ? 10 : 10
    const startY = isRound ? 92 : Math.round(height * 0.18)
    const titleY = isRound ? 24 : 20
    const titleSize = isRound ? 28 : 26
    const subtitleY = isRound ? 54 : 48
    const subtitleSize = isRound ? 16 : 14
    const rowTextSize = isRound ? 22 : 20
    const footerButtonH = isRound ? 58 : 44
    const footerButtonY = isRound ? height - footerButtonH : height - 58
    const controlModes = getAvailableControlModes()
    const tiltCalibration = loadTiltCalibration()
    const tiltStatus = tiltCalibration ? t('tiltCalibrationReady') : t('tiltCalibrationMissing')

    createLabel({
      x: pad,
      y: titleY,
      w: fullWidth,
      h: 32,
      text: t('settings'),
      textSize: titleSize,
      color: COLORS.accent,
    })

    createLabel({
      x: pad,
      y: subtitleY,
      w: fullWidth,
      h: 24,
      text: t('tapToChange'),
      textSize: subtitleSize,
      color: COLORS.textMuted,
    })

    createActionButton({
      x: pad,
      y: startY,
      w: fullWidth,
      h: rowHeight,
      text: `${t('controlLabel')}  ${formatSettingValue(
        'controlMode',
        settings.controlMode
      )}`,
      textSize: rowTextSize,
      onClick: () =>
        updateSetting(
          'controlMode',
          cycleOption(controlModes, settings.controlMode)
        ),
    })

    createActionButton({
      x: pad,
      y: startY + (rowHeight + rowGap) * 1,
      w: fullWidth,
      h: rowHeight,
      text: `${t('wristLabel')}  ${formatSettingValue(
        'wristSide',
        settings.wristSide
      )}`,
      textSize: rowTextSize,
      onClick: () =>
        updateSetting(
          'wristSide',
          settings.wristSide === 'left' ? 'right' : 'left'
        ),
    })

    createActionButton({
      x: pad,
      y: startY + (rowHeight + rowGap) * 2,
      w: fullWidth,
      h: rowHeight,
      text: `${t('timeLabel')}  ${formatSettingValue(
        'timeScale',
        settings.timeScale
      )}`,
      textSize: rowTextSize,
      onClick: () =>
        updateSetting(
          'timeScale',
          cycleOption(TIME_SCALE_OPTIONS, settings.timeScale)
        ),
    })

    createActionButton({
      x: pad,
      y: startY + (rowHeight + rowGap) * 3,
      w: fullWidth,
      h: rowHeight,
      text: `${t('spawnLabel')}  ${formatSettingValue(
        'spawnMultiplier',
        settings.spawnMultiplier
      )}`,
      textSize: rowTextSize,
      onClick: () =>
        updateSetting(
          'spawnMultiplier',
          cycleOption(SPAWN_MULTIPLIER_OPTIONS, settings.spawnMultiplier)
        ),
    })

    createActionButton({
      x: pad,
      y: startY + (rowHeight + rowGap) * 4,
      w: fullWidth,
      h: rowHeight,
      text: FEATURE_FLAGS.tiltCalibration
        ? `${t('tiltCalibrationLabel')}  ${tiltStatus}`
        : `${t('tiltLabel')}  ${formatSettingValue(
            'tiltSensitivity',
            settings.tiltSensitivity
          )}`,
      textSize: rowTextSize,
      onClick: FEATURE_FLAGS.tiltCalibration
        ? () => push({ url: ROUTES.TILT_CALIBRATION })
        : () => {},
    })

    if (isRound) {
      createRoundButtonPair({
        x: pad,
        y: footerButtonY,
        w: fullWidth,
        h: footerButtonH,
        left: {
          text: t('back'),
          textSize: 20,
          onClick: () => back(),
        },
        right: {
          text: t('play'),
          textSize: 20,
          normalColor: COLORS.accent,
          pressColor: 0xc9a900,
          textColor: COLORS.background,
          onClick: () => push({ url: ROUTES.GAME }),
        },
      })
    } else {
      createActionButton({
        x: pad,
        y: footerButtonY,
        w: Math.floor((fullWidth - 12) / 2),
        h: footerButtonH,
        text: t('back'),
        textSize: 20,
        onClick: () => back(),
      })

      createActionButton({
        x: pad + Math.floor((fullWidth - 12) / 2) + 12,
        y: footerButtonY,
        w: Math.floor((fullWidth - 12) / 2),
        h: footerButtonH,
        text: t('play'),
        textSize: 20,
        normalColor: COLORS.accent,
        pressColor: 0xc9a900,
        textColor: COLORS.background,
        onClick: () => push({ url: ROUTES.GAME }),
      })
    }
  },
})
