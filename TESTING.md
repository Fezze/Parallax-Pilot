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

### Commands

- `npm run sim:doctor`: Check system readiness for simulator testing
- `npm run sim:smoke`: Run default Golden Balls smoke test scenario
- `npm run sim:run <scenario.json>`: Run specific scenario

### Calibration

Create `.test/simulator/calibration.local.json` based on `calibration.example.json` to define screen coordinates and targets.

Screenshots are saved to `output/simulator/`.

### Scenarios

Scenarios are JSON files in `.test/simulator/scenarios/` defining steps like wait, focus, key, tap, swipe, screenshot.

Example: `gameplay-smoke.json` tests basic gameplay flow.