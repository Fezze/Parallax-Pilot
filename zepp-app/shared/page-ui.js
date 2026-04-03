import {
  align,
  createWidget,
  event,
  setStatusBarVisible,
  text_style,
  widget,
} from '@zos/ui'
import { createSysTimer } from '@zos/timer'
import { COLORS } from './constants.js'

const ROUND_PAIR_CLICK_DELAY_MS = 90
const BUTTON_TEXT_MIN_SIZE = 14

function estimateTextWidth(text, textSize) {
  let units = 0

  for (const char of Array.from(String(text ?? ''))) {
    if (char === ' ') {
      units += 0.34
      continue
    }

    if (/[.,:/|]/.test(char)) {
      units += 0.38
      continue
    }

    if (/[0-9]/.test(char)) {
      units += 0.56
      continue
    }

    units += 0.62
  }

  return units * textSize
}

function resolveButtonTextSpec(text, textSize, textWidth, minTextSize = BUTTON_TEXT_MIN_SIZE) {
  const safeText = String(text ?? '')
  const safeWidth = Math.max(0, textWidth - 20)
  let resolvedSize = textSize

  while (resolvedSize > minTextSize && estimateTextWidth(safeText, resolvedSize) > safeWidth) {
    resolvedSize -= 1
  }

  return {
    text: safeText,
    textSize: resolvedSize,
  }
}

function deferClick(onClick, delayMs = 0) {
  if (!onClick) {
    return undefined
  }

  if (delayMs <= 0) {
    return onClick
  }

  return () => {
    try {
      createSysTimer(false, delayMs, () => {
        onClick()
      })
      return
    } catch (_error) {}

    if (typeof setTimeout === 'function') {
      setTimeout(() => {
        onClick()
      }, delayMs)
      return
    }

    onClick()
  }
}

export function hideStatusBar() {
  try {
    setStatusBarVisible(false)
  } catch (_error) {}
}

export function createLabel({
  x,
  y,
  w,
  h,
  text,
  color = COLORS.textPrimary,
  textSize = 24,
  alignH = align.CENTER_H,
  alignV = align.CENTER_V,
  onClick,
}) {
  const label = createWidget(widget.TEXT, {
    x,
    y,
    w,
    h,
    text,
    color,
    text_size: textSize,
    click_func: onClick,
    align_h: alignH,
    align_v: alignV,
    text_style: text_style.NONE,
  })

  if (onClick && typeof label?.addEventListener === 'function') {
    label.addEventListener(event.CLICK_UP, () => {
      onClick()
    })
  }

  return label
}

export function createActionButton({
  x,
  y,
  w,
  h,
  text,
  onClick,
  normalColor = COLORS.button,
  pressColor = COLORS.buttonPress,
  textColor = COLORS.textPrimary,
  textSize = 22,
  textWidth = w,
  minTextSize = BUTTON_TEXT_MIN_SIZE,
  radius = Math.round(h / 2),
  flat = false,
}) {
  const resolved = resolveButtonTextSpec(text, textSize, textWidth, minTextSize)

  return createWidget(widget.BUTTON, {
    x,
    y,
    w,
    h,
    text: resolved.text,
    color: textColor,
    text_size: resolved.textSize,
    text_w: textWidth,
    radius,
    flat,
    normal_color: normalColor,
    press_color: pressColor,
    click_func: onClick,
  })
}

export function createManualRectButton({
  x,
  y,
  w,
  h,
  text,
  onClick,
  normalColor = COLORS.button,
  pressColor = COLORS.buttonPress,
  textColor = COLORS.textPrimary,
  textSize = 22,
  radius = Math.round(h / 2),
  textAlign = align.CENTER_H,
  textInset = 0,
  renderLabel = true,
  clickDelayMs = 0,
}) {
  const delayedClick = deferClick(onClick, clickDelayMs)
  const resolved = resolveButtonTextSpec(text, textSize, w - textInset * 2)
  const rect = createWidget(widget.BUTTON, {
    x,
    y,
    w,
    h,
    text: '',
    color: textColor,
    text_size: textSize,
    radius,
    normal_color: normalColor,
    press_color: pressColor,
    click_func: delayedClick,
  })

  if (renderLabel) {
    createLabel({
      x: x + textInset,
      y,
      w: w - textInset * 2,
      h,
      text: resolved.text,
      color: textColor,
      textSize: resolved.textSize,
      alignH: textAlign,
      onClick: delayedClick,
    })
  }

  return rect
}

export function createRoundButtonPair({
  x,
  y,
  w,
  h,
  gap = 0,
  left,
  right,
}) {
  const seamPad = Math.round(h / 2)
  const buttonWidth = Math.floor((w - gap) / 2)
  const leftX = x
  const rightX = x + buttonWidth + gap
  const labelInset = Math.max(12, Math.round(h * 0.26))
  const leftResolved = resolveButtonTextSpec(
    left.text,
    left.textSize ?? 22,
    buttonWidth - labelInset * 2
  )
  const rightResolved = resolveButtonTextSpec(
    right.text,
    right.textSize ?? 22,
    buttonWidth - labelInset * 2
  )

  createManualRectButton({
    x: leftX,
    y,
    w: buttonWidth,
    h,
    text: leftResolved.text,
    onClick: left.onClick,
    normalColor: left.normalColor,
    pressColor: left.pressColor ?? COLORS.buttonPress,
    textColor: left.textColor,
    textSize: left.textSize,
    textAlign: align.RIGHT,
    textInset: labelInset,
    renderLabel: false,
    clickDelayMs: ROUND_PAIR_CLICK_DELAY_MS,
  })

  createWidget(widget.BUTTON, {
    x: leftX + buttonWidth - seamPad,
    y,
    w: seamPad,
    h,
    text: '',
    color: left.textColor ?? COLORS.textPrimary,
    text_size: left.textSize ?? 22,
    normal_color: left.normalColor ?? COLORS.button,
    press_color: left.pressColor ?? COLORS.buttonPress,
    click_func: deferClick(left.onClick, ROUND_PAIR_CLICK_DELAY_MS),
    radius: 0,
    flat: true,
  })

  createManualRectButton({
    x: rightX,
    y,
    w: buttonWidth,
    h,
    text: right.text,
    onClick: right.onClick,
    normalColor: right.normalColor,
    pressColor: right.pressColor ?? COLORS.buttonPress,
    textColor: right.textColor,
    textSize: right.textSize,
    textAlign: align.LEFT,
    textInset: labelInset,
    renderLabel: false,
    clickDelayMs: ROUND_PAIR_CLICK_DELAY_MS,
  })

  createWidget(widget.BUTTON, {
    x: rightX,
    y,
    w: seamPad,
    h,
    text: '',
    color: right.textColor ?? COLORS.textPrimary,
    text_size: right.textSize ?? 22,
    normal_color: right.normalColor ?? COLORS.button,
    press_color: right.pressColor ?? COLORS.buttonPress,
    click_func: deferClick(right.onClick, ROUND_PAIR_CLICK_DELAY_MS),
    radius: 0,
    flat: true,
  })

  createLabel({
    x: leftX + labelInset,
    y,
    w: buttonWidth - labelInset * 2,
    h,
    text: left.text,
    color: left.textColor ?? COLORS.textPrimary,
    textSize: leftResolved.textSize,
    alignH: align.RIGHT,
    onClick: deferClick(left.onClick, ROUND_PAIR_CLICK_DELAY_MS),
  })

  createLabel({
    x: rightX + labelInset,
    y,
    w: buttonWidth - labelInset * 2,
    h,
    text: rightResolved.text,
    color: right.textColor ?? COLORS.textPrimary,
    textSize: rightResolved.textSize,
    alignH: align.LEFT,
    onClick: deferClick(right.onClick, ROUND_PAIR_CLICK_DELAY_MS),
  })
}
