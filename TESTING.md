# Testing

## Playwright Browser Preview Tests

Run browser-based preview tests:

```bash
npm run test:playwright
npm run test:playwright:screens  # Screenshot validation
npm run test:playwright:headed   # Headed mode
```

## Real Simulator Harness

Start with [the native simulator runbook](docs/NATIVE_SIMULATOR_VALIDATION.md), including the post-restart procedure and the required evidence.

For testing on the actual Zepp Simulator runtime:

### Prerequisites

- Zepp Simulator installed at `/opt/simulator/simulator`
- Zeus CLI installed
- Input automation: `xdotool` (X11) or `ydotool` (Wayland)
- Screenshot tool: `gnome-screenshot`, `scrot`, or `grim`
- Graphical session (X11 or Wayland)
- Optional: local calibration file at `.test/simulator/calibration.local.json`

### Commands

- `npm run sim:doctor`: Check system readiness for simulator testing
- `npm run sim:smoke`: Run the Parallax Pilot native gameplay smoke scenario
- `npm run sim:run -- .test/simulator/scenarios/gameplay-smoke.json`: Run a specific scenario
- `npm run bridge`: Start `zeus bridge` without bumping app version

### Calibration

Create `.test/simulator/calibration.local.json` based on `calibration.example.json` to define screen coordinates and targets.

Screenshots are saved to `output/simulator/`.

### Scenarios

Scenarios are JSON files in `.test/simulator/scenarios/`.

Supported actions:

- `launch`: start the Zepp Simulator with a cleaned Electron environment
- `wait`: sleep for `ms`
- `focus`: focus the simulator window using the calibrated title pattern
- `key`: send a key such as `Home`
- `hold`: hold a calibrated target for `ms`, then release
- `verify-app`: reject foreign or stale application deployments
- `tap`: click a calibrated target
- `swipe`: drag from a calibrated target by `dx` and `dy`
- `screenshot`: save a screenshot under `output/simulator/<scenario-id>/`
- `bridge`: run `zeus bridge`
- `connect`: wait until Developer Bridge is reachable on `127.0.0.1:7650`
- `install`: run `zeus install`

`gameplay-smoke.json` covers home, settings, touch controls, world progression, results and replay. Deploy the current application first and start on its home screen with default tilt controls. The scenario changes tilt to touch once; inspect the settings screenshot to confirm the starting state. Allow a run to end naturally; if the results frame still shows gameplay, continue observing until game over before accepting or attempting replay. A zero command exit means the actions completed, not that every screen was correct. Review the saved native frames and runtime logs.

Set actual watch framebuffer bounds and control coordinates in `.test/simulator/calibration.local.json`. The example uses a 480 px round screen; other profiles need their own coordinates. The runner refuses the uncalibrated example on a real run. It also rejects a different app or deployment older than application source files.

If desktop screenshot utilities are unavailable, set `ZEPP_SIMULATOR_SCREENSHOT_DRIVER=native` and run the simulator with Chromium remote debugging enabled. The runner reads its `DevToolsActivePort` file (override with `ZEPP_SIMULATOR_CDP_PORT_FILE`) and calls the installed simulator screenshot service to capture the firmware framebuffer. This is not a screenshot of the Electron shell. Set `ZEPP_SIMULATOR_ROOT` for deployment metadata stored outside the default config directory. Native screenshots require a running firmware simulator.

The `hold` action presses a calibrated gameplay point for `ms` (1–10000 ms) and always releases the pointer. `verify-app` checks the deployed app ID, source path and freshness.

`bridge-install-screenshot.json` is an opt-in bridge flow for attach, install, and screenshot capture.

### Validation Flow

Run this sequence for real runtime validation:

```bash
npm run sim:doctor
npm run dev
npm run sim:smoke
npm run build
```

### References

- https://docs.zepp.com/docs/guides/tools/simulator/
- https://docs.zepp.com/docs/v2/guides/faq/developer-bridge-mode/
- https://docs.zepp.com/docs/guides/tools/studio/
## Required final native validation

Every code change must be exercised at least once in the actual Zepp OS Simulator with current app sources deployed. Record the profile, version, affected flow, reviewed native screenshots and runtime log findings. `sim:doctor`, dry runs, browser mocks and builds alone do not meet this gate. If blocked, document the concrete reason and report simulator validation as incomplete. See `AGENTS.md`.


### Desktop lock and native input

A host screen lock can block desktop input while firmware screenshots continue
working. Do not accept a zero exit code when screenshots show no navigation.
For X11 select the `Qemu-system-arm` window class, since GNOME can expose an
identically named decoration window. A temporary `gnome-session-inhibit
--inhibit idle --reason "Parallax Pilot validation" ...` can prevent automatic
host locking during desktop-driven tests; it must not disable lock settings
permanently or unlock a protected desktop.

When automatic touch injection is unreliable, use the guided native mode:

```bash
ZEPP_SIMULATOR_SCREENSHOT_DRIVER=native npm run sim:smoke -- --manual-input
```

The operator performs each prompted action on the real firmware screen, then
confirms in the terminal. Screenshots, deployment freshness checks and evidence
recording remain automatic. Manual mode never substitutes a browser mock or
changes game state; its evidence records `inputDriver: manual`. Review the
native screenshots and logs before accepting the run. This fallback follows
Golden Balls' manual simulator checklist; PourOverFlow's September 2026 review
explicitly records unreliable automatic touch injection and startup-only smoke.
A host lock must be unlocked by its user before manual interaction continues.
Native capture requires Node.js 22+ and the installed simulator screenshot
service. It does not capture the Electron shell as a substitute for firmware.
