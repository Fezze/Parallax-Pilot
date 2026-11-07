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

export const prop = {
  MORE: 'MORE',
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

function createEventWidget(type, props) {
  const listeners = new Map()

  return {
    type,
    props: { ...props },
    setProperty(name, value) {
      if (name === prop.MORE && value && typeof value === 'object') {
        Object.assign(this.props, value)
        return
      }
      this.props[name] = value
    },
    addEventListener(name, handler) {
      listeners.set(name, handler)
    },
    __emit(name, payload) {
      const handler = listeners.get(name)
      if (handler) {
        handler(payload)
      }
    },
  }
}

function createTextEventWidget(type, props) {
  const listeners = new Map()

  const instance = {
    type,
    props: { ...props },
    setProperty(name, value) {
      if (name === prop.MORE && value && typeof value === 'object') {
        Object.assign(this.props, value)
        return
      }
      this.props[name] = value
    },
    addEventListener(name, handler) {
      listeners.set(name, handler)
    },
    __emit(name, payload) {
      const handler = listeners.get(name)
      if (handler) {
        handler(payload)
      }
    },
  }

  Object.defineProperty(instance, 'normal_color', {
    get() {
      return this.props.normal_color
    },
    set(value) {
      this.props.normal_color = value
    },
  })

  Object.defineProperty(instance, 'press_color', {
    get() {
      return this.props.press_color
    },
    set(value) {
      this.props.press_color = value
    },
  })

  return instance
}

export function __enableSpriteWidgets() {
  widget.IMG = 'IMG'
  widget.GROUP = 'GROUP'
  prop.VISIBLE = 'VISIBLE'
}

function createSpriteWidget(type, props, parent) {
  const instance = createEventWidget(type, props)
  const calls = []
  const set = instance.setProperty
  instance.setProperty = (name, value) => {
    calls.push({ name, value })
    set.call(instance, name, value)
  }
  instance.__propertyCalls = calls
  instance.__parent = parent
  return instance
}

export function createWidget(type, props) {
  if (type === 'IMG' || type === 'GROUP') {
    const instance = createSpriteWidget(type, props, null)
    widgets.push(instance)
    if (type === 'GROUP') instance.createWidget = (childType, childProps) => {
      const child = createSpriteWidget(childType, childProps, instance)
      widgets.push(child)
      return child
    }
    return instance
  }
  const instance =
    type === widget.CANVAS
      ? createCanvasWidget(type, props)
      : type === widget.TEXT || type === widget.BUTTON
        ? createTextEventWidget(type, props)
      : type === widget.FILL_RECT
        ? createEventWidget(type, props)
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
  return widgets.filter(
    (item) => item.type === widget.BUTTON || item.type === widget.FILL_RECT
  )
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
  delete widget.IMG
  delete widget.GROUP
  delete prop.VISIBLE
  statusBarVisible = true
}
