export const align = {
  CENTER_H: 'CENTER_H',
  CENTER_V: 'CENTER_V',
}

export const text_style = {
  NONE: 'NONE',
}

export const widget = {
  TEXT: 'TEXT',
  BUTTON: 'BUTTON',
  CANVAS: 'CANVAS',
}

export const event = {
  CLICK_DOWN: 'CLICK_DOWN',
  CLICK_UP: 'CLICK_UP',
  MOVE: 'MOVE',
}

const widgets = []
let statusBarVisible = true

function createCanvasWidget(type, props) {
  const listeners = new Map()
  const drawCalls = []

  return {
    type,
    props: { ...props },
    addEventListener(name, handler) {
      listeners.set(name, handler)
    },
    clear(args) {
      drawCalls.push({ method: 'clear', args })
    },
    drawRect(args) {
      drawCalls.push({ method: 'drawRect', args })
    },
    drawText(args) {
      drawCalls.push({ method: 'drawText', args })
    },
    setPaint(args) {
      drawCalls.push({ method: 'setPaint', args })
    },
    strokeCircle(args) {
      drawCalls.push({ method: 'strokeCircle', args })
    },
    strokeArc(args) {
      drawCalls.push({ method: 'strokeArc', args })
    },
    drawLine(args) {
      drawCalls.push({ method: 'drawLine', args })
    },
    __getDrawCalls() {
      return [...drawCalls]
    },
    __emit(name, payload) {
      const handler = listeners.get(name)
      if (handler) {
        handler(payload)
      }
    },
  }
}

export function createWidget(type, props) {
  const instance =
    type === widget.CANVAS
      ? createCanvasWidget(type, props)
      : {
          type,
          props: { ...props },
        }

  widgets.push(instance)
  return instance
}

export function setStatusBarVisible(value) {
  statusBarVisible = value
}

export function __getWidgets() {
  return [...widgets]
}

export function __getButtonWidgets() {
  return widgets.filter((item) => item.type === widget.BUTTON)
}

export function __getTextWidgets() {
  return widgets.filter((item) => item.type === widget.TEXT)
}

export function __getCanvasWidgets() {
  return widgets.filter((item) => item.type === widget.CANVAS)
}

export function __isStatusBarVisible() {
  return statusBarVisible
}

export function __resetUI() {
  widgets.length = 0
  statusBarVisible = true
}
