import { getDeviceInfo } from '@zos/device'
import { back, push, replace } from '@zos/router'
import { COLORS, ROUTES, RESULTS_PAGE_SIZE } from '../../shared/constants.js'
import { createActionButton, createLabel, hideStatusBar } from '../../shared/page-ui.js'
import { parseRouteParams } from '../../shared/params.js'
import { loadLastSession, loadScores } from '../../shared/storage.js'
import { buildScoreRow, formatDurationMs, paginateScores } from '../../shared/view-models.js'

Page({
  onInit(params) {
    this.pageParams = parseRouteParams(params, { pageIndex: 0 })
  },
  build() {
    hideStatusBar()

    const deviceInfo = getDeviceInfo()
    const scores = loadScores()
    const lastSession = loadLastSession()
    const { pageIndex, pageCount, items } = paginateScores(
      scores,
      this.pageParams.pageIndex || 0,
      RESULTS_PAGE_SIZE
    )
    const { width, height } = deviceInfo
    const pad = Math.round(width * 0.07)
    const fullWidth = width - pad * 2
    const listTop = lastSession ? 158 : 118

    createLabel({
      x: pad,
      y: 22,
      w: fullWidth,
      h: 32,
      text: lastSession ? 'RUN OVER' : 'SCOREBOARD',
      textSize: 28,
      color: COLORS.accent,
    })

    if (lastSession) {
      createLabel({
        x: pad,
        y: 58,
        w: fullWidth,
        h: 34,
        text: `${lastSession.score}`,
        textSize: 30,
        color: COLORS.textPrimary,
      })

      createLabel({
        x: pad,
        y: 92,
        w: fullWidth,
        h: 22,
        text: `${formatDurationMs(lastSession.survivedMs)}  |  ${lastSession.timeScale}x / ${lastSession.spawnMultiplier}x`,
        textSize: 16,
        color: COLORS.textMuted,
      })

      createLabel({
        x: pad,
        y: 116,
        w: fullWidth,
        h: 18,
        text: 'LAST 100 RUNS BELOW',
        textSize: 14,
        color: COLORS.textMuted,
      })
    }

    if (items.length === 0) {
      createLabel({
        x: pad,
        y: listTop + 40,
        w: fullWidth,
        h: 28,
        text: 'NO RUNS SAVED YET',
        textSize: 18,
        color: COLORS.textMuted,
      })
    } else {
      items.forEach((entry, index) => {
        createLabel({
          x: pad,
          y: listTop + index * 30,
          w: fullWidth,
          h: 24,
          text: buildScoreRow(entry, pageIndex * RESULTS_PAGE_SIZE + index),
          textSize: 16,
          color: index === 0 && pageIndex === 0 ? COLORS.accent : COLORS.textPrimary,
        })
      })
    }

    createLabel({
      x: pad,
      y: height - 96,
      w: fullWidth,
      h: 18,
      text: `${pageIndex + 1} / ${pageCount}`,
      textSize: 14,
      color: COLORS.textMuted,
    })

    createActionButton({
      x: pad,
      y: height - 70,
      w: Math.floor((fullWidth - 16) / 3),
      h: 44,
      text: 'PREV',
      onClick: () =>
        replace({
          url: ROUTES.RESULTS,
          params: JSON.stringify({
            pageIndex: Math.max(pageIndex - 1, 0),
          }),
        }),
    })

    createActionButton({
      x: pad + Math.floor((fullWidth - 16) / 3) + 8,
      y: height - 70,
      w: Math.floor((fullWidth - 16) / 3),
      h: 44,
      text: 'PLAY',
      normalColor: COLORS.accent,
      pressColor: 0xc9a900,
      textColor: COLORS.background,
      onClick: () => push({ url: ROUTES.GAME }),
    })

    createActionButton({
      x: pad + (Math.floor((fullWidth - 16) / 3) + 8) * 2,
      y: height - 70,
      w: Math.floor((fullWidth - 16) / 3),
      h: 44,
      text: 'NEXT',
      onClick: () =>
        replace({
          url: ROUTES.RESULTS,
          params: JSON.stringify({
            pageIndex: Math.min(pageIndex + 1, pageCount - 1),
          }),
        }),
    })

    createActionButton({
      x: pad,
      y: height - 122,
      w: fullWidth,
      h: 38,
      text: 'BACK',
      onClick: () => back(),
      textSize: 18,
    })
  },
})
