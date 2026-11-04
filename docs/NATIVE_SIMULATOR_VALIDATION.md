# Native simulator validation for the next agent

This is the verified Linux procedure for Parallax Pilot. Read `AGENTS.md` first.
Final validation must include actual firmware execution, reviewed native frames
and native logs. Readiness checks, browser mocks and build success alone are
insufficient. Keep the original application audit and its artifacts unchanged.

## Verified environment and input contract

Verified on November 4, 2026: Zepp Simulator 2.1.1, Balance 2 firmware 1.1.0,
API 4.2, app 1110694/version 2.3.22/code 73. The application manifest remains v3,
API target 4.0 and minimum/compatible 3.6. No new watch API is required.

The user works on the same desktop. **Do not move/warp the host cursor, raise
windows or take keyboard focus.** Use the native adapter below. It checks the
visible QEMU client and its process/socket binding before every event. Desktop
window moves do not change the guest framebuffer coordinates. Closed, hidden,
ambiguous or unrelated windows cause a failure instead of a redirected click.

The installed vendor QEMU encodes absolute 11-bit positions in relative events:
`0x7fff0000 | coordinate` for motion, `0x7fff0800 | coordinate` for button events,
plus the matching left-button state. This contract was inspected in the vendor
`gd_button_event`/`gd_event` code and verified with real firmware interaction.
Standard absolute QMP events are rejected, and ordinary untagged relative
motion does not reproduce this protocol. Setup checks the vendor fingerprints
and the adapter accepts QEMU 6.2. Do not assume stock/other QEMU versions match.

## Start after a restart

1. Inspect current Git changes and app version; preserve other work. Use host
   process/local-socket access if the sandbox reports EPERM. Save full logs to a
   fresh task artifact folder and return only summaries to the model.
2. Start the simulator from the repository root with native logging:

   ```bash
   mkdir -p output/simulator/session
   env -u ELECTRON_RUN_AS_NODE -u ELECTRON_NO_ATTACH_CONSOLE \
     EMULATOR_LOG=1 GDK_BACKEND=x11 /opt/simulator/simulator \
     --no-sandbox --ozone-platform=x11 \
     > output/simulator/session/simulator.log 2>&1
   ```

   Keep it running. In its UI select **Balance 2**, start **Emulator** if off,
   and enable **Bridge**. Selecting a profile may already start firmware: do not
   toggle it off again. Setup uses the actual simulator UI/debug connection and
   does not require host-pointer interaction.
3. Deploy in a separate terminal and keep the watcher running until native
   validation finishes:

   ```bash
   npm run dev -- --no-version-bump
   ```

   Choose **Amazfit Balance 2** if prompted. Wait for `rebuild done` and
   `refreshing simulator`. The no-bump flag preserves an already chosen version
   through testing and final packaging.
4. Enable cursor-free input:

   ```bash
   npm run sim:input
   ```

   This restarts only this selected simulator using a temporary launcher/private
   socket, then restores the original launcher getter. Installed files and app
   sources are unchanged. It must return exit zero while QEMU remains running.
   Copy the **current** printed socket path; never reuse a pre-restart value:

   ```bash
   export ZEPP_SIMULATOR_QMP_SOCKET=/tmp/parallax-native-SESSION/qmp.sock
   export ZEPP_SIMULATOR_SCREENSHOT_DRIVER=native
   npm run sim:doctor
   ```
5. Inspect a native settings frame and establish the scenario's **TILT** starting
   state, then return to home. Do not assume persisted state or blindly cycle
   CONTROL a fixed number of times. The pointer helper can send native taps
   without host focus; capture and inspect the resulting frame when preparing.
6. Run the full scenario:

   ```bash
   npm run sim:smoke -- --calibration .test/simulator/calibration.example.json
   ```

   The example's 480x480 dimensions and normalized targets are valid for native
   Balance 2 input; its desktop origin is ignored on this path. Other profiles
   need their own native dimensions/targets. Native input does not use xdotool,
   ydotool, XTest or `windowactivate`.

## Accept the actual flow, not just an exit code

Inspect all saved frames. Required outcomes:

- 01: real home screen; 02/03: TILT changes to TOUCH;
- 04/05/06: game starts, upper/lower holds move the ship in matching directions,
  with actual asteroid/world progression;
- 07–09: natural game over and saved score/duration; allow a longer wait if a run
  survives the nominal 60 seconds;
- 10: **PLAY on the right** starts a new game. BACK on the left is not replay.

The existing R5 results-state issue can show SCOREBOARD instead of RUN OVER.
Verify the actual saved row and PLAY behavior; do not conceal that issue or
silently count the wrong screen as a pass. `execution.json` deliberately says
review is required. A wrong precondition or unchanged home frame is not success.

The November 4 native evidence includes genuine TILT-to-TOUCH changes, both ship
movement directions, asteroids, natural death/saved rows and a restarted game.
Source tests establish schedule equivalence separately. Simulator observations
are not measured physical FPS, CPU/energy use or sensor feel. Balance 1 remains
unavailable.

## Native frames and native logs

For longer observations, start the recorder **before** triggering gameplay:

```bash
npm run sim:observe -- --count 120 --interval-ms 1000 \
  --output-dir output/simulator/session/gameplay \
  --runtime-log output/simulator/session/simulator.log
```

Use a fresh output folder. Wait for `Native recorder ready`, then trigger the
native game using the input adapter. Do not run simultaneous screenshot clients
or the full smoke's captures: the installed service has one pending slot.

The recorder saves profile/deployment/version, timestamps, PNG hashes and error
status in `observation.json`. It also copies the launcher log and the installed
ConsoleInstanceModel's actual `native-console.log`. The launcher can print
Buffer summaries and separate screenshot-service warnings; inspect the native
console log for app route transitions, JS exceptions and unsupported APIs.
Preserve any existing `sim-debug.log` before starting the simulator: startup may
recreate that default file. Keep raw diagnostic files out of the source commit.

The October 30 recorder started after death and all frames showed the scoreboard
(11200 points/11.2 s). Those are native run/result evidence, not motion evidence.
Its URL.pathname bug wrote PNGs into a literal `%20` directory; recovered images
are in the R1 artifacts. Repository tools use filesystem paths correctly.

## Freshness, capture and troubleshooting

- Re-read `DevToolsActivePort`; a stale file is not a live endpoint. The simulator
  can choose its own port despite a command-line port argument.
- Zeus can retain the original project-import date in `last_app_info.json`.
  Verification checks actual `device/app.json` and `device.zip`: correct source
  project, matching ID/version, both artifact timestamps newer than app sources.
  Missing/stale/foreign artifacts fail. Never edit metadata to manufacture a pass.
- The raw CDP client uses the direct `ws` dependency and terminates its own
  connection. This Electron rejects Playwright browser-context setup; the built-in
  Node WebSocket close handshake also left a helper socket alive. Do not hide
  leaked connections with forced process exit.
- The native screenshot service leaves old 90-second timers running. The helper
  retries that particular unlabelled promise rejection once after 250 ms.
  Persistent failures still stop the run; a 120-frame test crossed that boundary.
- On this two-monitor Wayland desktop, ydotool absolute placement targeted a
  different location than requested. A feedback diagnostic worked but used the
  host cursor, which the user explicitly disallowed. Legacy host input is now
  off by default and needs explicit prior consent plus
  `ZEPP_SIMULATOR_ALLOW_HOST_INPUT=1`; do not use it as an automatic fallback.
- GTK creates a hidden same-class helper and GNOME a same-title decoration.
  Native targeting requires the real titled QEMU client, visible state and its
  process owning the configured QMP socket. Check afresh before every event.
- If the vendor adapter is unsupported, guided `--manual-input` remains available
  with automatic native capture. Label who supplied input. Sibling notes do not
  provide a proven alternative: PourOverFlow's September review records unreliable
  touch injection and startup-only smoke; Golden Balls uses a manual checklist.

## Close out

Record profile/version, deployment, actions, reviewed native evidence, command
results and remaining limits in the task log. Then build the final version
(`npm run build:raw` if already bumped) and immediately make the required commit.
Record the commit and ZAB path. Stop only processes owned by this task if needed;
never modify sibling projects, old audit evidence or user security settings.
