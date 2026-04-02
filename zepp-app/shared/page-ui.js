import { align, createWidget, setStatusBarVisible, text_style, widget } from '@zos/ui'
import { COLORS } from './constants.js'

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
}) {
  return createWidget(widget.TEXT, {
    x,
    y,
    w,
    h,
    text,
    color,
    text_size: textSize,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
    text_style: text_style.NONE,
  })
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
}) {
  return createWidget(widget.BUTTON, {
    x,
    y,
    w,
    h,
    text,
    color: textColor,
    text_size: textSize,
    radius: Math.round(h / 2),
    normal_color: normalColor,
    press_color: pressColor,
    click_func: onClick,
  })
}
