import { getDeviceInfo } from '@zos/device'
import { back, push, replace } from '@zos/router'
import {
  COLORS,
  ROUTES,
  SPAWN_MULTIPLIER_OPTIONS,
  TIME_SCALE_OPTIONS,
  TILT_SENSITIVITY_OPTIONS,
} from '../../shared/constants.js'
import { sanitizeControlMode, supportsDigitalCrown } from '../../shared/device.js'
import { createActionButton, createLabel, hideStatusBar } from '../../shared/page-ui.js'
import { loadSettings, saveSettings } from '../../shared/storage.js'
import {
  cycleOption,
  formatSettingValue,
  getAvailableControlModes,
} from '../../shared/view-models.js'

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
    const crownSupported = supportsDigitalCrown(deviceInfo)
    const loadedSettings = loadSettings()
    const settings = {
      ...loadedSettings,
      controlMode: sanitizeControlMode(loadedSettings.controlMode, crownSupported),
    }

    if (settings.controlMode !== loadedSettings.controlMode) {
      saveSettings(settings)
    }

    const { width, height } = deviceInfo
    const pad = Math.round(width * 0.07)
    const fullWidth = width - pad * 2
    const rowHeight = Math.round(Math.min(52, height * 0.105))
    const rowGap = 10
    const startY = 92
    const controlModes = getAvailableControlModes(crownSupported)

    createLabel({
      x: pad,
      y: 24,
      w: fullWidth,
      h: 32,
      text: 'SETTINGS',
      textSize: 28,
      color: COLORS.accent,
    })

    createLabel({
      x: pad,
      y: 54,
      w: fullWidth,
      h: 24,
      text: 'TAP ROW TO CYCLE',
      textSize: 16,
      color: COLORS.textMuted,
    })

    createActionButton({
      x: pad,
      y: startY,
      w: fullWidth,
      h: rowHeight,
      text: `CONTROL  ${formatSettingValue('controlMode', settings.controlMode)}`,
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
      text: `WRIST  ${formatSettingValue('wristSide', settings.wristSide)}`,
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
      text: `TIME  ${formatSettingValue('timeScale', settings.timeScale)}`,
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
      text: `SPAWN  ${formatSettingValue(
        'spawnMultiplier',
        settings.spawnMultiplier
      )}`,
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
      text: `TILT  ${formatSettingValue(
        'tiltSensitivity',
        settings.tiltSensitivity
      )}`,
      onClick: () =>
        updateSetting(
          'tiltSensitivity',
          cycleOption(TILT_SENSITIVITY_OPTIONS, settings.tiltSensitivity)
        ),
    })

    createLabel({
      x: pad,
      y: startY + (rowHeight + rowGap) * 5 + 2,
      w: fullWidth,
      h: 22,
      text: crownSupported ? 'DIGITAL CROWN DETECTED' : 'DIGITAL CROWN UNAVAILABLE',
      textSize: 15,
      color: COLORS.textMuted,
    })

    createActionButton({
      x: pad,
      y: height - 64,
      w: Math.floor((fullWidth - 12) / 2),
      h: 46,
      text: 'BACK',
      onClick: () => back(),
    })

    createActionButton({
      x: pad + Math.floor((fullWidth - 12) / 2) + 12,
      y: height - 64,
      w: Math.floor((fullWidth - 12) / 2),
      h: 46,
      text: 'PLAY',
      normalColor: COLORS.accent,
      pressColor: 0xc9a900,
      textColor: COLORS.background,
      onClick: () => push({ url: ROUTES.GAME }),
    })
  },
})
