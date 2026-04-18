import * as ble from '@zos/ble'
import { createLeaderboardDeviceBridge } from './shared/leaderboard-device-bridge.js'

App({
  globalData: {
    leaderboardBridge: null,
  },
  onCreate() {
    const leaderboardBridge = createLeaderboardDeviceBridge(ble)
    this.globalData.leaderboardBridge = leaderboardBridge
    leaderboardBridge.connect()
  },
  onDestroy() {
    this.globalData.leaderboardBridge?.disconnect()
  },
})
