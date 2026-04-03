import { getDeviceInfo, SCREEN_SHAPE_ROUND } from '@zos/device'
import { push, replace } from '@zos/router'
import { COLORS, ROUTES, RESULTS_PAGE_SIZE } from '../../shared/constants.js'
import { createActionButton, createLabel, hideStatusBar } from '../../shared/page-ui.js'
import { t } from '../../shared/i18n.js'
import { parseRouteParams } from '../../shared/params.js'
import { loadLastSession, loadScores } from '../../shared/storage.js'
import { buildScoreRow, formatDurationMs, paginateScores } from '../../shared/view-models.js'

function createRowButtons({ width, y, buttons, safePad, gap = 10 }) {
  if (buttons.length === 0) {
    return
  }

  const rowWidth = width - safePad * 2
  const buttonWidth = Math.floor((rowWidth - gap * (buttons.length - 1)) / buttons.length)
  const totalWidth = buttonWidth * buttons.length + gap * (buttons.length - 1)
  let currentX = Math.round((width - totalWidth) / 2)

  buttons.forEach((button) => {
    createActionButton({
      x: currentX,
      y,
      w: buttonWidth,
      h: button.h || 44,
      text: button.text,
      onClick: button.onClick,
      normalColor: button.normalColor,
      pressColor: button.pressColor,
      textColor: button.textColor,
      textSize: button.textSize,
    })

    currentX += buttonWidth + gap
  })
}

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
    const isRound = deviceInfo.screenShape === SCREEN_SHAPE_ROUND
    const isSquare = !isRound
    const pad = Math.round(width * (isRound ? 0.11 : 0.07))
    const fullWidth = width - pad * 2
    const isEmptyState = items.length === 0
    const isRoundScoreboard = isRound && !lastSession
    const isSquareScoreboard = isSquare && !lastSession
    const scoreTextSize = isSquareScoreboard ? 15 : 16
    const listRowGap = isRoundScoreboard
      ? 28
      : isRound && lastSession
        ? 24
        : isSquareScoreboard
          ? 22
          : 24
    const listTop = lastSession ? (isRound ? 158 : 148) : isRound ? 96 : 98
    const navRowY = isRoundScoreboard
      ? 390
      : isSquareScoreboard
        ? 284
        : height - (isRound ? 116 : 110)
    const actionRowY = isRoundScoreboard
      ? 432
      : isSquare && !lastSession
        ? 336
        : isSquare
          ? 326
          : isEmptyState
            ? 396
            : height - 66
    const hasPrev = pageCount > 1 && pageIndex > 0
    const hasNext = pageCount > 1 && pageIndex < pageCount - 1
    const listBottomY =
      items.length > 0
        ? listTop + (items.length - 1) * listRowGap + 24
        : listTop + 68
    let pagerY = Math.max(
      listBottomY + (isRound ? 18 : 10),
      isRoundScoreboard ? 360 : isSquareScoreboard ? 260 : height - (isRound ? 138 : 124)
    )

    if (!lastSession) {
      pagerY = Math.min(pagerY, navRowY - (isRound ? 24 : 20))
    }
    const navButtons = []

    if (hasPrev) {
      navButtons.push({
        text: t('prev'),
        onClick: () =>
          replace({
            url: ROUTES.RESULTS,
            params: JSON.stringify({
              pageIndex: pageIndex - 1,
            }),
          }),
      })
    }

    if (hasNext) {
      navButtons.push({
        text: t('next'),
        onClick: () =>
          replace({
            url: ROUTES.RESULTS,
            params: JSON.stringify({
              pageIndex: pageIndex + 1,
            }),
          }),
      })
    }

    createLabel({
      x: pad,
      y: 22,
      w: fullWidth,
      h: 32,
      text: lastSession ? t('runOver') : t('scoreboard'),
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
        text: t('recentRuns'),
        textSize: 14,
        color: COLORS.textMuted,
      })
    }

    if (items.length === 0) {
      createLabel({
        x: pad,
        y: isRound ? listTop + 40 : listTop + 54,
        w: fullWidth,
        h: 28,
        text: t('noRunsSavedYet'),
        textSize: 18,
        color: COLORS.textMuted,
      })
    } else {
      items.forEach((entry, index) => {
        createLabel({
          x: pad,
          y: listTop + index * listRowGap,
          w: fullWidth,
          h: 24,
          text: buildScoreRow(entry, pageIndex * RESULTS_PAGE_SIZE + index),
          textSize: scoreTextSize,
          color: index === 0 && pageIndex === 0 ? COLORS.accent : COLORS.textPrimary,
        })
      })
    }

    if (pageCount > 1) {
      createLabel({
        x: pad,
        y: pagerY,
        w: fullWidth,
        h: 18,
        text: `${pageIndex + 1} / ${pageCount}`,
        textSize: 14,
        color: COLORS.textMuted,
      })
    }

    if (navButtons.length > 0) {
      createRowButtons({
        width,
        y: navRowY,
        safePad: Math.round(width * (isRound ? 0.18 : 0.22)),
        buttons: navButtons.map((button) => ({
          ...button,
          textSize: isRound ? 18 : 20,
          h: isRound ? 40 : 42,
        })),
      })
    }

    createRowButtons({
      width,
      y: actionRowY,
      safePad: Math.round(width * (isRound ? 0.18 : 0.16)),
      buttons: [
        {
          text: t('back'),
          onClick: () => push({ url: ROUTES.HOME }),
        },
        {
          text: t('play'),
          normalColor: COLORS.accent,
          pressColor: 0xc9a900,
          textColor: COLORS.background,
          onClick: () => push({ url: ROUTES.GAME }),
        },
      ],
    })
  },
})
