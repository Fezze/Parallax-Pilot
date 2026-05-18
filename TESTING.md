# Testing

## Playwright Browser Preview Tests

Run browser-based preview tests:

```bash
npm run test:playwright
npm run test:playwright:screens  # Screenshot validation
npm run test:playwright:headed   # Headed mode
```

## Real Simulator Harness

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
- `npm run sim:smoke`: Run default Golden Balls smoke test scenario
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
- `tap`: click a calibrated target
- `swipe`: drag from a calibrated target by `dx` and `dy`
- `screenshot`: save a screenshot under `output/simulator/<scenario-id>/`
- `bridge`: run `zeus bridge`
- `connect`: wait until Developer Bridge is reachable on `127.0.0.1:7650`
- `install`: run `zeus install`

`gameplay-smoke.json` covers launch, tutorial dismissal, board mode toggles, speed changes, recentering, and screenshots.

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