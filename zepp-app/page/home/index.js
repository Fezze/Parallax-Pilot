import { getDeviceInfo } from '@zos/device'
import { push } from '@zos/router'
import { COLORS, ROUTES } from '../../shared/constants.js'
import {
  resolveTravelDirection,
  sanitizeControlMode,
  supportsDigitalCrown,
} from '../../shared/device.js'
import { createActionButton, createLabel, hideStatusBar } from '../../shared/page-ui.js'
import { loadScores, loadSettings, saveSettings } from '../../shared/storage.js'
import { formatSettingValue } from '../../shared/view-models.js'

Page({
  build() {
    hideStatusBar()

    const deviceInfo = getDeviceInfo()
    const settings = loadSettings()
    const crownSupported = supportsDigitalCrown(deviceInfo)
    const safeControlMode = sanitizeControlMode(settings.controlMode, crownSupported)
    if (safeControlMode !== settings.controlMode) {
      saveSettings({
        ...settings,
        controlMode: safeControlMode,
      })
    }

    const nextSettings = {
      ...settings,
      controlMode: safeControlMode,
    }
    const scores = loadScores()
    const { width, height } = deviceInfo
    const pad = Math.round(width * 0.08)
    const fullWidth = width - pad * 2
    const buttonHeight = Math.round(Math.min(62, height * 0.13))
    const titleY = Math.round(height * 0.07)
    const travelDirection = resolveTravelDirection(nextSettings.wristSide)
    const incomingDirection = travelDirection === 'right' ? 'LEFT' : 'RIGHT'

    createLabel({
      x: pad,
      y: titleY,
      w: fullWidth,
      h: 40,
      text: 'PARALLAX PILOT',
      textSize: Math.round(Math.min(32, width * 0.08)),
      color: COLORS.accent,
    })

    createLabel({
      x: pad,
      y: titleY + 42,
      w: fullWidth,
      h: 26,
      text: `SHIP ${travelDirection.toUpperCase()}  ASTEROIDS ${incomingDirection}`,
      textSize: 18,
      color: COLORS.textMuted,
    })

    createLabel({
      x: pad,
      y: titleY + 72,
      w: fullWidth,
      h: 24,
      text: `CONTROL ${formatSettingValue('controlMode', nextSettings.controlMode)}  WRIST ${formatSettingValue('wristSide', nextSettings.wristSide)}`,
      textSize: 16,
      color: COLORS.textMuted,
    })

    createActionButton({
      x: pad,
      y: Math.round(height * 0.34),
      w: fullWidth,
      h: buttonHeight,
      text: 'START RUN',
      normalColor: COLORS.accent,
      pressColor: 0xc9a900,
      textColor: COLORS.background,
      onClick: () => push({ url: ROUTES.GAME }),
    })

    createActionButton({
      x: pad,
      y: Math.round(height * 0.34) + buttonHeight + 14,
      w: fullWidth,
      h: buttonHeight - 6,
      text: 'SETTINGS',
      onClick: () => push({ url: ROUTES.SETTINGS }),
    })

    createActionButton({
      x: pad,
      y: Math.round(height * 0.34) + buttonHeight * 2 + 22,
      w: fullWidth,
      h: buttonHeight - 6,
      text: 'SCOREBOARD',
      onClick: () => push({ url: ROUTES.RESULTS }),
    })

    createLabel({
      x: pad,
      y: height - 90,
      w: fullWidth,
      h: 22,
      text: `TIME ${nextSettings.timeScale}x  SPAWN ${nextSettings.spawnMultiplier}x`,
      textSize: 18,
      color: COLORS.textPrimary,
    })

    createLabel({
      x: pad,
      y: height - 62,
      w: fullWidth,
      h: 20,
      text: `${scores.length} RUNS SAVED  TOP LIST 100`,
      textSize: 16,
      color: COLORS.textMuted,
    })

    createLabel({
      x: pad,
      y: height - 38,
      w: fullWidth,
      h: 18,
      text: crownSupported ? 'CROWN AVAILABLE' : 'CROWN NOT AVAILABLE',
      textSize: 14,
      color: COLORS.textMuted,
    })
  },
})
