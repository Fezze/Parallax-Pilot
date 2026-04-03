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
    const invoke = () => {
      onClick()
    }

    const isNodeLike =
      typeof process !== 'undefined' &&
      process !== null &&
      typeof process === 'object' &&
      !!process.versions?.node

    if (!isNodeLike && typeof setTimeout === 'function') {
      setTimeout(() => {
        invoke()
      }, delayMs)
      return
    }

    try {
      createSysTimer(false, delayMs, () => {
        invoke()
      })
      return
    } catch (_error) {}

    if (typeof setTimeout === 'function') {
      setTimeout(() => {
        invoke()
      }, delayMs)
      return
    }

    invoke()
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

function createManagedRoundHalfButton({
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
  clickDelayMs = 0,
}) {
  const delayedClick = deferClick(onClick, clickDelayMs)
  const resolved = resolveButtonTextSpec(text, textSize, textWidth)

  return createWidget(widget.BUTTON, {
    x,
    y,
    w,
    h,
    text: resolved.text,
    color: textColor,
    text_size: resolved.textSize,
    text_w: textWidth,
    radius: Math.round(h / 2),
    normal_color: normalColor,
    press_color: pressColor,
    click_func: delayedClick,
  })
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
  const buttonWidth = Math.floor((w - gap) / 2)
  const leftX = x
  const rightX = x + buttonWidth + gap
  const labelInset = Math.max(12, Math.round(h * 0.26))
  const leftBaseColor = left.normalColor ?? COLORS.button
  const leftPressColor = left.pressColor ?? COLORS.buttonPress
  const rightBaseColor = right.normalColor ?? COLORS.button
  const rightPressColor = right.pressColor ?? COLORS.buttonPress
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

  createManagedRoundHalfButton({
    x: leftX,
    y,
    w: buttonWidth,
    h,
    text: leftResolved.text,
    onClick: left.onClick,
    normalColor: leftBaseColor,
    pressColor: leftPressColor,
    textColor: left.textColor,
    textSize: left.textSize,
    textWidth: buttonWidth - labelInset,
    clickDelayMs: ROUND_PAIR_CLICK_DELAY_MS,
  })

  createManagedRoundHalfButton({
    x: rightX,
    y,
    w: buttonWidth,
    h,
    text: rightResolved.text,
    onClick: right.onClick,
    normalColor: rightBaseColor,
    pressColor: rightPressColor,
    textColor: right.textColor,
    textSize: right.textSize,
    textWidth: buttonWidth - labelInset,
    clickDelayMs: ROUND_PAIR_CLICK_DELAY_MS,
  })
}
