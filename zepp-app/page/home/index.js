import { getDeviceInfo, SCREEN_SHAPE_ROUND } from '@zos/device'
import { push } from '@zos/router'
import { COLORS, ROUTES } from '../../shared/constants.js'
import {
  sanitizeControlMode,
  supportsDigitalCrown,
} from '../../shared/device.js'
import { t } from '../../shared/i18n.js'
import { createActionButton, createLabel, hideStatusBar } from '../../shared/page-ui.js'
import { loadScores, loadSettings, saveSettings } from '../../shared/storage.js'

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
    const isRound = deviceInfo.screenShape === SCREEN_SHAPE_ROUND
    const pad = Math.round(width * 0.08)
    const fullWidth = width - pad * 2
    const buttonHeight = isRound ? Math.round(Math.min(62, height * 0.13)) : 46
    const secondaryButtonHeight = isRound ? buttonHeight - 6 : 42
    const titleY = isRound ? Math.round(height * 0.07) : 24
    const subtitleY = titleY + (isRound ? 42 : 38)
    const buttonStartY = isRound ? Math.round(height * 0.34) : 120
    const buttonGap = isRound ? 14 : 12
    const metaPrimaryY = isRound ? height - 90 : height - 72
    const metaSecondaryY = isRound ? height - 62 : height - 46

    createLabel({
      x: pad,
      y: titleY,
      w: fullWidth,
      h: 40,
      text: t('homeTitle'),
      textSize: Math.round(Math.min(32, width * 0.08)),
      color: COLORS.accent,
    })

    createLabel({
      x: pad,
      y: subtitleY,
      w: fullWidth,
      h: 26,
      text: t('homeSubtitle'),
      textSize: isRound ? 18 : 16,
      color: COLORS.textMuted,
    })

    createActionButton({
      x: pad,
      y: buttonStartY,
      w: fullWidth,
      h: buttonHeight,
      text: t('startRun'),
      normalColor: COLORS.accent,
      pressColor: 0xc9a900,
      textColor: COLORS.background,
      onClick: () => push({ url: ROUTES.GAME }),
    })

    createActionButton({
      x: pad,
      y: buttonStartY + buttonHeight + buttonGap,
      w: fullWidth,
      h: secondaryButtonHeight,
      text: t('settings'),
      textSize: isRound ? 22 : 20,
      onClick: () => push({ url: ROUTES.SETTINGS }),
    })

    createActionButton({
      x: pad,
      y: buttonStartY + buttonHeight + secondaryButtonHeight + buttonGap * 2,
      w: fullWidth,
      h: secondaryButtonHeight,
      text: t('scoreboard'),
      textSize: isRound ? 22 : 20,
      onClick: () => push({ url: ROUTES.RESULTS }),
    })

    createLabel({
      x: pad,
      y: metaPrimaryY,
      w: fullWidth,
      h: 22,
      text: t('homeMeta', {
        timeScale: nextSettings.timeScale,
        spawnMultiplier: nextSettings.spawnMultiplier,
      }),
      textSize: isRound ? 18 : 16,
      color: COLORS.textPrimary,
    })

    createLabel({
      x: pad,
      y: metaSecondaryY,
      w: fullWidth,
      h: 20,
      text: t('savedRuns', { count: scores.length }),
      textSize: isRound ? 16 : 15,
      color: COLORS.textMuted,
    })
  },
})
