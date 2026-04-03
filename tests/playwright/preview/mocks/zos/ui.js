import {
  addWidget,
  colorToCss,
  setStatusBarState,
} from './state.js'

export const align = {
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  CENTER_H: 'CENTER_H',
  TOP: 'TOP',
  BOTTOM: 'BOTTOM',
  CENTER_V: 'CENTER_V',
}

export const text_style = {
  NONE: 'NONE',
}

export const widget = {
  TEXT: 'TEXT',
  BUTTON: 'BUTTON',
  FILL_RECT: 'FILL_RECT',
  CANVAS: 'CANVAS',
}

export const event = {
  CLICK_DOWN: 'CLICK_DOWN',
  CLICK_UP: 'CLICK_UP',
  MOVE: 'MOVE',
}

function applyFrameStyle(element, props) {
  element.style.position = 'absolute'
  element.style.left = `${props.x || 0}px`
  element.style.top = `${props.y || 0}px`
  element.style.width = `${props.w || 0}px`
  element.style.height = `${props.h || 0}px`
}

function createTextWidget(props) {
  const element = document.createElement('div')
  applyFrameStyle(element, props)
  element.textContent = props.text ?? ''
  element.style.display = 'flex'
  element.style.alignItems = 'center'
  element.style.justifyContent =
    props.align_h === align.LEFT
      ? 'flex-start'
      : props.align_h === align.RIGHT
        ? 'flex-end'
        : 'center'
  element.style.color = colorToCss(props.color, '#ffffff')
  element.style.fontSize = `${props.text_size || 24}px`
  element.style.fontFamily = 'ui-monospace, monospace'
  element.style.textAlign =
    props.align_h === align.LEFT
      ? 'left'
      : props.align_h === align.RIGHT
        ? 'right'
        : 'center'
  element.style.pointerEvents = props.click_func ? 'auto' : 'none'
  if (props.click_func) {
    element.style.cursor = 'pointer'
    element.addEventListener('click', () => {
      props.click_func?.()
    })
  }
  return addWidget({
    type: widget.TEXT,
    props,
    element,
  })
}

function createFillRectWidget(props) {
  const element = document.createElement('div')
  applyFrameStyle(element, props)
  element.style.background = colorToCss(props.color, '#171717')
  element.style.borderRadius = `${props.radius || 0}px`
  element.style.cursor = 'pointer'
  element.addEventListener('click', () => {
    props.click_func?.()
  })
  return addWidget({
    type: widget.FILL_RECT,
    props,
    element,
  })
}

function createButtonWidget(props) {
  const element = document.createElement('button')
  applyFrameStyle(element, props)
  element.textContent = props.text ?? ''
  element.style.border = '0'
  element.style.padding = '0'
  element.style.cursor = 'pointer'
  element.style.borderRadius = `${props.radius || 0}px`
  element.style.background = colorToCss(props.normal_color, '#171717')
  element.style.color = colorToCss(props.color, '#ffffff')
  element.style.fontSize = `${props.text_size || 22}px`
  element.style.fontFamily = 'ui-monospace, monospace'
  element.style.boxShadow = props.flat
    ? 'none'
    : 'inset 0 0 0 1px rgba(255,255,255,0.04)'
  element.addEventListener('click', () => {
    props.click_func?.()
  })
  return addWidget({
    type: widget.BUTTON,
    props,
    element,
  })
}

function createCanvasApi(context, props, element) {
  const listeners = new Map()
  let paint = {
    color: '#ffffff',
    lineWidth: 1,
  }

  function strokeStyle(color) {
    return colorToCss(color, paint.color)
  }

  return addWidget({
    type: widget.CANVAS,
    props,
    element,
    addEventListener(name, callback) {
      listeners.set(name, callback)
    },
    clear({ x, y, w, h }) {
      context.clearRect(x, y, w, h)
    },
    drawRect({ x1, y1, x2, y2, color }) {
      context.fillStyle = colorToCss(color, '#000000')
      context.fillRect(x1, y1, x2 - x1, y2 - y1)
    },
    drawText({ x, y, text, text_size, color }) {
      context.fillStyle = colorToCss(color, '#ffffff')
      context.font = `${text_size || 16}px ui-monospace, monospace`
      context.textBaseline = 'top'
      context.fillText(String(text ?? ''), x, y)
    },
    setPaint({ color, line_width }) {
      paint = {
        color: colorToCss(color, '#ffffff'),
        lineWidth: line_width || 1,
      }
    },
    strokeCircle({ center_x, center_y, radius, color }) {
      context.strokeStyle = strokeStyle(color)
      context.lineWidth = paint.lineWidth
      context.beginPath()
      context.arc(center_x, center_y, radius, 0, Math.PI * 2)
      context.stroke()
    },
    strokeArc({
      center_x,
      center_y,
      radius_x,
      radius_y,
      start_angle,
      end_angle,
      color,
    }) {
      context.strokeStyle = strokeStyle(color)
      context.lineWidth = paint.lineWidth
      context.beginPath()
      context.ellipse(
        center_x,
        center_y,
        radius_x,
        radius_y,
        0,
        (start_angle * Math.PI) / 180,
        (end_angle * Math.PI) / 180
      )
      context.stroke()
    },
    drawLine({ x1, y1, x2, y2, color }) {
      context.strokeStyle = strokeStyle(color)
      context.lineWidth = paint.lineWidth
      context.beginPath()
      context.moveTo(x1, y1)
      context.lineTo(x2, y2)
      context.stroke()
    },
  })
}

function createCanvasWidget(props) {
  const element = document.createElement('canvas')
  element.width = props.w
  element.height = props.h
  applyFrameStyle(element, props)
  const context = element.getContext('2d')
  return createCanvasApi(context, props, element)
}

export function createWidget(type, props) {
  if (type === widget.TEXT) {
    return createTextWidget(props)
  }

  if (type === widget.BUTTON) {
    return createButtonWidget(props)
  }

  if (type === widget.FILL_RECT) {
    return createFillRectWidget(props)
  }

  if (type === widget.CANVAS) {
    return createCanvasWidget(props)
  }

  throw new Error(`Unsupported widget type: ${type}`)
}

export function setStatusBarVisible(value) {
  setStatusBarState(value)
}
