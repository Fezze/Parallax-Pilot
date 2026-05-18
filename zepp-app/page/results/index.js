import { getDeviceInfo, SCREEN_SHAPE_ROUND } from '@zos/device'
import { push, replace } from '@zos/router'
import { COLORS, ROUTES, RESULTS_PAGE_SIZE } from '../../shared/constants.js'
import {
  createActionButton,
  createLabel,
  createRoundButtonPair,
  hideStatusBar,
} from '../../shared/page-ui.js'
import { t } from '../../shared/i18n.js'
import { parseRouteParams } from '../../shared/params.js'
import { loadLastSession, loadScores } from '../../shared/storage.js'
import { buildScoreRow, formatDurationMs, paginateScores } from '../../shared/view-models.js'

function createRowButtons({ width, y, buttons, safePad, gap = 10, roundInset = 0, fixedButtonWidth }) {
  if (buttons.length === 0) {
    return
  }

  if (buttons.length === 2 && gap === 0) {
    createRoundButtonPair({
      x: safePad + roundInset,
      y,
      w: width - safePad * 2 - roundInset * 2,
      h: buttons[0].h || 44,
      left: buttons[0],
      right: buttons[1],
    })
    return
  }

  const rowWidth = width - safePad * 2
  const buttonWidth = fixedButtonWidth || Math.floor((rowWidth - gap * (buttons.length - 1)) / buttons.length)
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
      textWidth: button.textWidth || buttonWidth,
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
    const isSmallRound = isRound && width <= 420
    const isSquare = !isRound
    const isCompactRound = isRound && width <= 454
    const roundActionButtonH = isSmallRound ? 52 : 58
    const roundNavButtonH = isSmallRound ? 46 : 50
    const roundRowGap = isSmallRound ? 10 : 12
    const pad = Math.round(width * (isRound ? 0.11 : 0.07))
    const roundActionPad = Math.round(width * 0.07)
    const roundActionInset = isRound ? Math.max(12, Math.round(width * (isCompactRound ? 0.05 : 0.04))) : 0
    const roundFooterActionInset = isRound ? Math.max(roundActionInset, Math.round(width * 0.11)) : 0
    const actionSafePad = isRound ? roundActionPad : Math.round(width * 0.16)
    const actionGap = isRound ? 0 : 10
    const actionPairWidth = width - actionSafePad * 2 - (isRound ? roundFooterActionInset * 2 : 0)
    const actionButtonWidth = Math.floor((actionPairWidth - actionGap) / 2)
    const fullWidth = width - pad * 2
    const isEmptyState = items.length === 0
    const isRoundScoreboard = isRound && !lastSession
    const isSquareScoreboard = isSquare && !lastSession
    const scoreTextSize = isSquareScoreboard ? 15 : isSmallRound ? 15 : 16
    const listRowGap = isRoundScoreboard
      ? isSmallRound ? 24 : 28
      : isRound && lastSession
        ? 24
        : isSquareScoreboard
          ? 24
          : 24
    const listTop = lastSession
      ? (isRound ? (isSmallRound ? 148 : 158) : 142)
      : isRound
        ? (isSmallRound ? 88 : 96)
        : 104
    const hasPrev = pageCount > 1 && pageIndex > 0
    const hasNext = pageCount > 1 && pageIndex < pageCount - 1
    const listBottomY =
      items.length > 0
        ? listTop + (items.length - 1) * listRowGap + 24
        : listTop + 68
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

    const actionRowY = isRound
      ? (isSmallRound ? height - roundActionButtonH - 12 : height - roundActionButtonH)
      : isSquare && !lastSession
        ? height - 62
        : isSquare
          ? height - 64
          : isEmptyState
            ? 396
            : height - 66
    const navButtonH = isRound
      ? (navButtons.length === 2 ? roundActionButtonH : roundNavButtonH)
      : 44
    const navRowY = isRound
      ? actionRowY - roundRowGap - navButtonH
      : isSquareScoreboard
        ? actionRowY - 52
        : height - 110
    let pagerY = Math.max(
      listBottomY + (isRound ? 18 : 10),
      isRoundScoreboard ? navRowY - 24 : isSquareScoreboard ? navRowY - 24 : height - (isRound ? 138 : 124)
    )

    if (!lastSession) {
      pagerY = Math.min(pagerY, navRowY - (isRound ? (isSmallRound ? 20 : 24) : 20))
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
        safePad: actionSafePad,
        roundInset: isRound ? roundFooterActionInset : 0,
        fixedButtonWidth: navButtons.length === 1 ? actionPairWidth : actionButtonWidth,
        gap: actionGap,
        buttons: navButtons.map((button) => ({
          ...button,
          textSize: isRound ? (isSmallRound ? 18 : 20) : 18,
          textWidth: isRound ? undefined : Math.round(width * 0.56),
          h: navButtonH,
        })),
      })
    }

    createRowButtons({
      width,
      y: actionRowY,
      safePad: actionSafePad,
      roundInset: roundFooterActionInset,
      gap: actionGap,
      buttons: [
        {
          text: t('back'),
          textSize: isRound ? (isSmallRound ? 18 : 20) : 22,
          h: isRound ? roundActionButtonH : 44,
          onClick: () => push({ url: ROUTES.HOME }),
        },
        {
          text: t('play'),
          textSize: isRound ? (isSmallRound ? 18 : 20) : 22,
          h: isRound ? roundActionButtonH : 44,
          normalColor: COLORS.accent,
          pressColor: 0xc9a900,
          textColor: COLORS.background,
          onClick: () => push({ url: ROUTES.GAME }),
        },
      ],
    })
  },
})
