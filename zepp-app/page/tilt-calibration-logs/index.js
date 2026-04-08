import { align } from '@zos/ui'
import { replace } from '@zos/router'
import { getDeviceInfo, SCREEN_SHAPE_ROUND } from '@zos/device'
import { COLORS, ROUTES } from '../../shared/constants.js'
import { createActionButton, createLabel, hideStatusBar } from '../../shared/page-ui.js'
import { loadTiltCalibrationReport } from '../../shared/storage.js'
import { t } from '../../shared/i18n.js'

Page({
  build() {
    hideStatusBar()

    const report = loadTiltCalibrationReport()
    const metrics = report?.metrics || {}
    const profile = report?.profile || {}
    const debug = report?.debug || {}
    const deviceInfo = getDeviceInfo()
    const isRound = deviceInfo.screenShape === SCREEN_SHAPE_ROUND
    const isSmallRound = isRound && deviceInfo.width <= 420
    const pad = Math.round(deviceInfo.width * 0.08)
    const fullWidth = deviceInfo.width - pad * 2
    const footerHeight = isRound ? (isSmallRound ? 42 : 46) : 44
    const footerY = isRound ? (isSmallRound ? deviceInfo.height - 60 : deviceInfo.height - 74) : deviceInfo.height - 54
    const startY = isRound ? (isSmallRound ? 76 : 86) : 92
    const rowGap = isRound ? (isSmallRound ? 23 : 28) : 28

    createLabel({
      x: pad,
      y: 24,
      w: fullWidth,
      h: 32,
      text: t('tiltCalibrationLogs'),
      textSize: isSmallRound ? 20 : 24,
      color: COLORS.accent,
    })

    function fmt(value) {
      return value ?? '-'
    }

    const summaryRows = [
      ['off', fmt(metrics.offset)],
      ['noise', fmt(metrics.noisePeak)],
      ['down', fmt(metrics.downPeak)],
      ['up', fmt(metrics.upPeak)],
      ['neg', fmt(profile.negativeRange)],
      ['pos', fmt(profile.positiveRange)],
      ['dead', fmt(profile.deadzone)],
      ['exp', fmt(profile.responseExponent)],
    ]

    summaryRows.forEach(([label, value], index) => {
      createLabel({
        x: pad + 6,
        y: startY + index * rowGap,
        w: Math.round(fullWidth * 0.34),
        h: 24,
        text: label,
        textSize: isRound ? (isSmallRound ? 12 : 14) : 15,
        color: COLORS.textMuted,
        alignH: align.LEFT,
      })
      createLabel({
        x: pad + Math.round(fullWidth * 0.34),
        y: startY + index * rowGap,
        w: Math.round(fullWidth * 0.66) - 6,
        h: 24,
        text: String(value),
        textSize: isRound ? (isSmallRound ? 14 : 16) : 17,
        color: COLORS.textPrimary,
        alignH: align.LEFT,
      })
    })

    const debugStartY = startY + summaryRows.length * rowGap + (isRound ? 8 : 14)
    createLabel({
      x: pad,
      y: debugStartY,
      w: fullWidth,
      h: 18,
      text: t('tiltCalibrationDebug'),
      textSize: isSmallRound ? 12 : 13,
      color: COLORS.accent,
      alignH: align.LEFT,
    })

    const debugRows = [
      `CTR smp=${fmt(debug.center?.samples)} hold=${fmt(debug.center?.holdMs)} rst=${fmt(debug.center?.resets)} rng=${fmt(debug.center?.settleRange)} mov=${fmt(debug.center?.avgStepDelta)} dev=${fmt(debug.center?.avgDeviation)}`,
      `DN  ent=${fmt(debug.down?.entryMs)} peak=${fmt(debug.down?.peakDelta)} hold=${fmt(debug.down?.holdMs)} rst=${fmt(debug.down?.resets)} rng=${fmt(debug.down?.settleRange)} mov=${fmt(debug.down?.avgStepDelta)} dev=${fmt(debug.down?.avgDeviation)}`,
      `UP  ent=${fmt(debug.up?.entryMs)} peak=${fmt(debug.up?.peakDelta)} hold=${fmt(debug.up?.holdMs)} rst=${fmt(debug.up?.resets)} rng=${fmt(debug.up?.settleRange)} mov=${fmt(debug.up?.avgStepDelta)} dev=${fmt(debug.up?.avgDeviation)}`,
    ]

    debugRows.forEach((row, index) => {
      createLabel({
        x: pad,
        y: debugStartY + 18 + index * 14,
        w: fullWidth,
        h: 14,
        text: row,
        textSize: isRound ? (isSmallRound ? 9 : 11) : 12,
        color: COLORS.textMuted,
        alignH: align.LEFT,
      })
    })

    createActionButton({
      x: pad,
      y: footerY,
      w: fullWidth,
      h: footerHeight,
      text: t('back'),
      textSize: isRound ? (isSmallRound ? 18 : 20) : 18,
      onClick: () => replace({ url: ROUTES.SETTINGS }),
    })
  },
})
