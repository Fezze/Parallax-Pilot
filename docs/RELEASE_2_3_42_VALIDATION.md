# Parallax Pilot 2.3.42 validation

The gameplay source is `c806728`. Browser fixture corrections are in `5a8077c`.
The manifest is v3, version 2.3.42, code 93, API target 4.0 and compatible
minimum 3.6.

## Host checks

All 231 Node tests passed. An independent 10 ms driver matched the optimized
TOUCH and SWIPE runs for the 16, 33, 50, 100, 200 ms and irregular schedules.
The 307 Playwright scenarios passed across the initial run and targeted
retries. Reviewed the final matrix of 60 gameplay screenshots for both
locales, wrists, shapes and all resolutions. The raw all-target build passed.

## Native simulator

Zepp Simulator 2.1.1 ran the freshly deployed 2.3.42/code 93 on Balance 2
firmware 1.1.0, API 4.2. Native pointer actions verified the QEMU window and
process before each event.

- SWIPE moved the ship in both directions. Reviewed asteroid appearances and
  departures, declining HP, a natural result of 14,960 points in 15.0 s, and
  PLAY returning to a fresh game. The replay ended at 12,070 points in 12.1 s.
- TOUCH moved the ship in both directions with held inputs. Reviewed asteroid
  appearances and departures, declining HP and a natural result of 14,200
  points in 14.2 s.
- TILT opened the expected calibration screen because the simulator had no
  usable profile. Calibration remained at step 1 and timed out. This profile's
  sensor panel offers no accelerometer input, so native TILT gameplay remains
  unverified. The host tests exercise per-quantum TILT readings and schedule
  parity. Cancel restored access to settings.
- Native logs confirm game, results and calibration routes. The reviewed
  capture has no app-specific JS exception or archived diagnostic markers.

Raw evidence is in `output/validation-2.3.42/native/` in the working copy.

## Physical Balance 2

On 7 November 2026, the Android Developer Bridge confirmed successful
installation of the Balance 2 preview package from the same source,
2.3.42/code 93, targeting device sources 9568512, 9568513 and 9568515.

- Package: `1110694-Parallax_Pilot-2.3.42-20261107220648.zab`
- SHA-256: `8c8e3374bbd7185e81149f1f51883ba11b03f236e1126d120ca4218a593b52c0`

The player declined camera recording. The planned physical comparison of
median, p95, p99 and longest unchanged-image intervals against 2.3.41 and
source-built 2.3.15 remains incomplete. Physical play observations and the
player's smoothness confirmation are pending.
