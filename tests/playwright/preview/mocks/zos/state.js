const defaultDeviceInfo = {
  width: 480,
  height: 480,
  screenShape: 'round',
  keyType: 'normal_21',
  keyNumber: 2,
}

const state = {
  deviceInfo: { ...defaultDeviceInfo },
  languageCode: 2,
  localStorage: new Map(),
  sessionStorage: new Map(),
  routerCalls: [],
  widgets: [],
  watchRoot: null,
  statusBarVisible: true,
}

export function colorToCss(color, fallback = '#ffffff') {
  if (typeof color !== 'number') {
    return fallback
  }

  return `#${color.toString(16).padStart(6, '0')}`
}

function applyWatchFrame() {
  if (!state.watchRoot) {
    return
  }

  state.watchRoot.innerHTML = ''
  state.watchRoot.style.width = `${state.deviceInfo.width}px`
  state.watchRoot.style.height = `${state.deviceInfo.height}px`
  state.watchRoot.style.borderRadius =
    state.deviceInfo.screenShape === 'round' ? '50%' : '28px'
}

export function setRootElement(element) {
  state.watchRoot = element
  applyWatchFrame()
}

export function resetRuntime() {
  state.deviceInfo = { ...defaultDeviceInfo }
  state.languageCode = 2
  state.localStorage = new Map()
  state.sessionStorage = new Map()
  state.routerCalls = []
  state.widgets = []
  state.statusBarVisible = true
  applyWatchFrame()
}

export function configureRuntime({
  deviceInfo = {},
  languageCode = 2,
  localStorage = {},
  sessionStorage = {},
}) {
  state.deviceInfo = {
    ...defaultDeviceInfo,
    ...deviceInfo,
  }
  state.languageCode = languageCode
  state.localStorage = new Map(Object.entries(localStorage))
  state.sessionStorage = new Map(Object.entries(sessionStorage))
  state.routerCalls = []
  state.widgets = []
  state.statusBarVisible = true
  applyWatchFrame()
}

export function getDeviceInfoState() {
  return { ...state.deviceInfo }
}

export function getLanguageCodeState() {
  return state.languageCode
}

export function getStorageMap(kind) {
  return kind === 'session' ? state.sessionStorage : state.localStorage
}

export function recordRouterCall(type, payload) {
  state.routerCalls.push({ type, payload })
}

export function setStatusBarState(value) {
  state.statusBarVisible = value
}

export function getStatusBarState() {
  return state.statusBarVisible
}

export function addWidget(entry) {
  state.widgets.push(entry)
  if (entry.element && state.watchRoot) {
    state.watchRoot.append(entry.element)
  }
  return entry
}

export function getRuntimeSnapshot() {
  return {
    widgets: [...state.widgets],
    texts: state.widgets
      .filter((widget) => widget.type === 'TEXT')
      .map((widget) => widget.props.text),
    buttons: state.widgets
      .filter((widget) => widget.type === 'BUTTON')
      .map((widget) => widget.props.text),
    canvasCount: state.widgets.filter((widget) => widget.type === 'CANVAS').length,
    routerCalls: [...state.routerCalls],
  }
}
