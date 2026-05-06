# Zepp Console Submission Draft

## Core

- App ID: `1110694`
- App name: `Parallax Pilot`
- Developer nickname: `Fezze`
- Service category: `Normal`
- App classification: `Game`
- Country or region: `TODO_CONFIRM_IN_CONSOLE`

## Package

- Application package: `artifacts/Parallax_Pilot-2.3.18-release.zab`
- Current app manifest version: `2.3.18`
- Current app manifest version code: `69`
- Supporting devices: auto-filled by Zepp Console after ZAB upload
- Current target device set in `app.json`:
  - `Amazfit Falcon`
  - `Amazfit Cheetah (Round)`
  - `Amazfit T-Rex Ultra`
  - `Amazfit Active 3 Premium`
  - `Amazfit T-Rex 3 Pro (44mm)`
  - `Amazfit Active 2 (Round)`
  - `Amazfit GTR 4`
  - `Amazfit Balance`
  - `Amazfit Balance 2`
  - `Amazfit T-Rex 3`
  - `Amazfit T-Rex 3 Pro (48mm)`
  - `Amazfit Active Max`
  - `Amazfit Cheetah Pro`
  - `Amazfit Active 2 (Square)`
  - `Amazfit Bip 6`
  - `Amazfit Active`
  - `Amazfit Cheetah (Square)`
  - `Amazfit GTS 4`
- Current release shape coverage: `round` and `square`

## Languages

- `en-US`
  Name: `Parallax Pilot`
  App introduction: `Arcade asteroid dodging on your watch.`
  App details: `listing/en-US.md`
  App profile preview image: `assets/language-preview/en-US-preview.png`
- `pl-PL`
  Name: `Parallax Pilot`
  App introduction: `Omijaj asteroidy na ekranie zegarka.`
  App details: `listing/pl-PL.md`
  App profile preview image: `assets/language-preview/pl-PL-preview.png`

## App Introduction Screenshots

- `en-US` round: `10` screenshots in `assets/screenshots/en-US/round/`
- `en-US` square: `10` screenshots in `assets/screenshots/en-US/square/`
- `pl-PL` round: `10` screenshots in `assets/screenshots/pl-PL/round/`
- `pl-PL` square: `10` screenshots in `assets/screenshots/pl-PL/square/`
- Full map: `assets/screenshots/manifest.json`
- Format prepared: `360x360 PNG` with transparent background
- Round export: no margins
- Rectangular export: equal left/right margins, rounded screen corners, and source border visible along the curved screen edge

## Store Icon

- `assets/icon/store-icon-240.png`

## Privacy Statement

- English: `privacy/en-US.md`
- Polish: `privacy/pl-PL.md`

## Calling Permissions

- Select in console: `Others`
- Do not select: `Heart Rate`, `Connect to the network`, `Positioning`, `Run in background`
- Runtime permissions used by the app:
  - `device:os.accelerometer`
  - `device:os.local_storage`
  - `data:os.device.info`

## SDK Included

- `No`

## Features Descriptions

- `Parallax Pilot is a watch-only arcade game. It uses the accelerometer for tilt controls, local storage for on-watch settings and score history, and device info for screen/layout adaptation. It does not use network access, location, heart rate, accounts, or background services.`

## Submission Notes

- Watch-only game
- No account system
- No phone-side companion sync
- No backend
- No cloud storage
- Score history and settings stay on the watch
