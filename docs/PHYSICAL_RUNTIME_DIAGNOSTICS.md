# Physical runtime diagnostics and event segments: 2.3.32

Version 2.3.29 observed the former full-world simulation architecture. Version
2.3.31 batches distant asteroid motion and adds separate interpolated display
state, while preserving the requested 16 ms timer, canonical 10 ms simulation,
collision geometry, input commands, damage/scoring timeline and visual detail.
The 250 ms interruption policy is still observed, rather than silently removed.
Diagnostics must be removed or disabled before the ordinary release following
this study. See SIMULATION_TIME.md for batching and presentation assumptions.

## Actual target and evidence limits

The user's physical Balance 2 reports firmware 6.4.15.1, API 5.0 and deviceSource
9568513. It is connected through the phone's Zepp Developer Bridge. The available
native simulator uses different firmware/API 4.2. Simulator execution verifies
compatibility and report delivery only; it is not a physical performance test.

The diagnostic timer boundaries use watch-side Date.now wall times. They include
preemption and synchronous native work. They are neither CPU-utilization samples
nor confirmed display-presentation times. Clock adjustments invalidate affected
observations. A zero duration can be below clock resolution. Sixty-four clock
reads before the game clock provide a bounded calibration, not a hardware speed
benchmark; a zero calibration duration does not mean the reads are free.

## Observation modes and overhead control

A dedicated local key, runtime_diagnostic_run_v1, alternates successive game
sessions between basic frame timing and sampled step-phase timing. This does not
modify game settings or scores. Odd run indices collect frame observations;
even indices additionally sample one in thirteen executed canonical event steps in compact mode. Logical skipped quanta remain included in total step counts but generate no phase samples or object/candidate visits. Legacy full-report mode retains its logical-step sampling cadence. The mode and game
settings appear in PP_DIAG_START before the game clock is created.
Counter writes reuse the same cached LocalStorage instance as scores. If storage
fails, modePersisted is false and sampled timing is selected explicitly rather
than silently pretending that sessions alternate.

Both modes are instrumented. Comparing them can reveal sensitivity to detailed
timestamping but cannot prove that the basic observer has no overhead. Compare
the diagnostic build with the preserved uninstrumented 2.3.28 on the physical
watch when interpreting an apparent change. Installation and gameplay should
not run simultaneously with unrelated device transfers or repeated screenshots.

Timing counters, histogram storage and a 64-frame numeric trace are allocated
before the frame loop. No per-frame object or array allocation is used by the
observer. The game itself still has its original allocation behavior. No live
overlay or per-frame console/file output is added. A single final report is
chunked after a completed callback at game over/destruction, or after 30 seconds
of observed wall time; after that the observer stops collecting. Reporting can
delay the results screen or the following callback, which is outside the recorded
window. There is no extra polling/report timer.
Each console envelope is at most 160 ASCII characters because native SBEngine
truncated longer messages during verification. The physical bridge then retained
only the first 30 messages from long synchronous exports. Compact PP_METRIC
reports therefore use at most 25 independently numbered records. They contain
the important aggregates, phase summaries, work counters and up to four paired
trace rows; they do not contain the full histograms or all 64 stored rows.
The legacy full export remains available to tests. Incomplete reports must
never be treated as valid complete samples.

## Recorded observations

- Callback arrival gap, previous approximately complete callback duration and
  their paired residual. A stable residual near 16 ms is evidence consistent
  with completion-relative scheduling; pauses, operating-system contention and
  quantization still need consideration. Aggregate averages alone cannot identify
  the scheduler.
- Update duration, native drawing-submission duration and observer bookkeeping.
  The final scalar/histogram writes after the final timestamp remain unmeasured;
  do not describe callback duration as exact CPU time.
- Actual world-step count, admitted/elapsed/pending simulation time and paused
  milliseconds. A normal zero-step callback differs from a discarded >250 ms
  interval.
- Per-step candidate-set size, full materialization/object-visit counts, sensor
  reads, contact candidates, pointer events and idle/held/moving groups.
  Raw MOVE callbacks are counted before the game's input filters. A short
  down/up sequence is classified as input even if released by the next frame.
- Sampled control/geometry/difficulty, spawning, movement/grid, candidate
  collection, collision/damage and health-animation phase durations. Sampling
  can miss rare work and alias with events; a zero or empty sampled phase is not
  proof that the phase is cheap. Vibration count is recorded as context because
  collision work can include a synchronous native call.

Storage, route changes and page destruction may execute inside the fatal world
step. Its terminal callback and sampled phases are recorded separately and are
excluded from steady-state aggregates. Finish/destroy during a callback defers
reporting until that callback returns through its measurement boundary.

## Physical collection procedure

Version 2.3.36 captures changed pointer coordinates and gesture boundaries with
their delivery times. The game timer interprets those samples before advancing
the simulation. Touch direction filtering still precedes the existing 10 ms
command compaction. Raw callback counts are folded into the observer once per
frame, and update timing includes the input drain. The renderer reads a reusable
frame of interpolated positions and displayed health. IMG remains the default,
with the Canvas path available for fallback. This keeps input capture separate
from drawing within the same JavaScript runtime.

1. Verify the installed version and Bridge target app-Android. Leave Zepp open
   on the phone. Keep the same watch firmware, brightness and time/spawn/wrist
   settings across comparisons; record any changes rather than normalizing them
   silently.
2. Collect a stationary/no-pointer run and a run with an upper/lower stationary
   hold and repeated drags. Repeat across the basic and sampled modes. A shared
   seed is not forced in ordinary gameplay; compare density/candidate counts as
   well as timings instead of assuming identical random scenes.
3. Let the run end naturally or wait for the 30-second diagnostic window. Preserve
   the original Bridge transcript, including errors and PP_DIAG_START metadata.
4. Decode PP_METRIC records with scripts/decode-runtime-diagnostics.mjs. Incomplete
   or conflicting chunks are not complete results. Preserve parsed JSON and the
   ordered trace CSV alongside the original logs.
5. Film visible motion and input externally if presentation and callback results
   disagree. Repeated camera frames indicate downstream presentation only when
   simulation time and submitted positions demonstrably advance.

## Interpretation gate

Long update phases with multiple catch-up steps support simulation pressure.
Long drawing-submission phases support synchronous bridge/native rendering cost.
Long arrival gaps with short measured callbacks support external scheduling or
contention. Gaps over 250 ms explain discarded simulation time, not just jerky
presentation. Regular callback delivery does not establish smooth displayed
frames. Preserve contradictory results and compare basic/sampled overhead before
selecting an optimization. No cause is declared from a local test or simulator
timing.

## Physical installation of the batched-motion candidate

On November 5, 2026, the phone Bridge reconnected as `app-Android`. The official Bridge command `install --target "Amazfit Balance 2"` compiled candidate 2.3.31/code 82 for device sources 9568512/9568513/9568515 and returned `Install lite app result: success`. Source implementation is commit b5c726475452288b293b0b88c51a91a30f20584a. Physical gameplay performance remains unconfirmed until a complete report is captured. The raw deployment transcript and package hashes are retained in the separate audit workspace.

This deployment-only follow-up preserves the already built and installed version. The version-bump pre-commit hook is omitted for this commit only, avoiding a metadata-only bump to an unbuilt version; no Git configuration or application source is changed by that omission.

## Complete physical evidence and the 2.3.32 correction

Both 2.3.31 reports were complete and show persistent slow motion: basic run5 advanced9,200ms in30,140ms wall; sampled run6 advanced9,270ms in30,102ms wall. Sampled per-step control/geometry/difficulty averaged7.18ms before the remaining stages. Distant-object batching was therefore insufficient and is not recorded as a successful physical fix.

Candidate2.3.32 skips full dispatch for touch/swipe quanta outside conservative collision windows and exact spawn/input boundaries. It preserves repeated scalar additions, canonical fatal time and the final two render poses. Tilt retains original per-quantum sensor sampling, while unchanged geometry and scheduled spawning avoid redundant work. The compact work record now appends skippedQuanta and eventQuanta after its original11 fields; the decoder accepts legacy8/11-field records too.

Compact accumulation retains bins only for the seven steady timing metrics whose p95 bounds are exported. Group/work/terminal fields use scalar aggregates and exact zero counters. Phase sampling follows executed events rather than skipped logical indices. Some final observer writes still follow the completion timestamp, so residual gaps must not be attributed solely to the OS or timer.

Candidate2.3.32 native validation used Zepp Simulator2.1.1, Balance2 firmware1.1.0/API4.2/source9568512. Both swipe and held touch moved the ship in both directions, advanced the world, ended naturally and saved scores. Two complete compact reports were decoded with both sampling modes, zero paused time and no candidate runtime exception matches. Their logical totals1487/1612 equal skipped1228/1347 plus executed259/265. Host correctness validation passed193 Node cases and96 actual-page comparisons against2.3.31 (31,056 state pairs, zero difference). Two browser assertions were updated from four full dispatches to four logical/skipped quanta and zero full dispatches; all four affected timing cases passed after the initial305 other cases had passed. These results do not establish physical watch speed.

## Physical 2.3.32 result and cooldown-aware candidate

The physical sampled run 8 completed 12,700 ms simulation in 16,338 ms wall, with 3,334 ms paused, 153 callbacks, 1,040 skipped quanta and 230 full event quanta. The user confirms improved speed but visible drops on asteroid impact. This validates improvement on Balance 2 only; weaker devices remain unmeasured. Source review found that spatial windows kept waking full steps after a hit even while the narrow phase necessarily rejected further damage during the 260 ms cooldown. Candidate 2.3.33 gates each window by its current per-asteroid readiness, including hits occurring after window construction. It preserves the exact ready quantum and independent contacts.

Candidate 2.3.33 passed 196 Node cases, all four affected browser timing cases and the 96-trace actual-page comparison against 2.3.32 (31,056 states, zero difference). Native Balance 2 firmware 1.1.0/API 4.2/source 9568512 ran a hands-off contact/death scenario: 1,271 logical quanta, 1,238 skipped and 33 executed, no paused time. Reviewed the partially depleted HUD/contact scene and saved RUN OVER result; no candidate runtime exception matches. Physical acceptance of 2.3.33 is still pending.

## Remaining frame variation in physical 2.3.33

Complete sampled physical run 10 advanced 10,550 ms in 10,867 ms wall with zero paused time and only 27 full event quanta. The user reports much better behavior but remaining random jumps/slowing during fly-bys. Mean callback arrival was 80.47 ms (max174), steady update38.34 ms (max132) and draw submission23.88 ms (max29). The mean residual15.02 ms is consistent with the requested16 ms pacing, without proving the exact scheduler. Candidate2.3.34 removes per-frame grid maintenance that now serves no collision consumer, uses an equivalent flat query only at births and bypasses unchanged quiet control/pose helpers. Source counts and host validation cannot prove performance on weaker devices.

Candidate 2.3.34 passed 200 Node cases, four browser timing cases and 96 actual-page comparisons with 2.3.33. All 31,056 state pairs matched. Native Balance 2 firmware 1.1.0, API 4.2, source 9568512 completed a hands-off run with spawning, damage and a saved result. The complete report recorded 1,276 logical quanta, 1,246 skipped quanta and 30 executed events. Physical cadence measurement awaits the phone Bridge.

The Android Bridge installed the Balance 2 package for 2.3.34 on November 7, 2026. The package was built from `5eb269a` with version code 85. The deployment record uses a documentation commit with the automatic version bump disabled for that invocation. The physical gameplay measurement follows installation.

## IMG renderer in 2.3.35

The game page selects `GAME_RENDERER = 'img'` during `build()`. The alternative value `canvas` selects the original full Canvas path. The IMG path creates a persistent background, moves reusable native images for the ship and asteroids, and draws the existing HUD on its input canvas when displayed health changes. The generated PNGs use the game geometry for each target and the view positions snap to pixels. The native `PP_RENDERER` marker identifies the active path before the timer starts.

Normal gameplay on Zepp Simulator Balance 2 firmware 1.1.0, API 4.2, source 9568512 selected IMG. The captured frames show asteroid images, held touch in both directions, a partially depleted HUD after contact, and a natural result of 13,990 points. The console contains a complete report and no candidate runtime errors. This run establishes ordinary gameplay behavior in the simulator. Physical rendering cost remains to be measured.

The Android Bridge built and installed the Balance 2 IMG package for 2.3.35, version code 86, on November 7, 2026. It uses application source commit `5703df0`. This documentation commit records deployment with the automatic version bump disabled for that invocation.

The Android Bridge installed the 2.3.36 Balance 2 package, version code 87, on November 7, 2026. The installed application uses source commit `a403b1e`. Native Balance 2 simulator runs verified both TOUCH and SWIPE with IMG. A physical gameplay report is pending.

## Collision timing in 2.3.37

The optional compact damage and impact records distinguish steady hit-frame
update, the next callback gap and residual, draw submission during IMG health
redraws, direct vibration call time, and terminal score save and results routing.
Only haptic and terminal operations add timing reads. A separate counter shows
how often a SWIPE target update left the current frame's trajectory unchanged.
The haptic mode, HUD animation and score persistence keep their prior behavior.

The Android Bridge installed the 2.3.37 Balance 2 package, version code 88, on November 7, 2026. The installed application uses source commit `d0baaec`. Native Balance 2 runs verified ordinary SWIPE and TOUCH gameplay and complete collision timing records. Physical 2.3.37 gameplay is pending at deployment.

## Loop work and score completion in 2.3.38

The terminal callback measurement ends before the separate score completion
task. Its scoreSaveMs field times only the authoritative history operation.
The earlier measurement combined the session and history writes inside the
terminal callback. Compact diagnostics emit the same fields using fewer
trace columns and aggregate updates. The candidate count covers eligible
asteroids passed to the exact damage check. Difficulty calculation now
belongs to the spawn phase.

The Android Bridge installed the 2.3.38 Balance 2 package, version code 89, on November 7, 2026. The installed application uses source commit `11274b6`. Physical gameplay timing is pending at deployment.

## Slow-update capture in 2.3.39

This diagnostic build retains the two slowest ordinary update callbacks
across the observed run, including their following arrival gaps when
available. It separates input drain, frame candidate scan, collision
window construction, full event steps, quiet advancement and final materialization. Spawn and
exact contact durations are nested within event steps. The associated
counts distinguish logical quanta from full event dispatch and raw inbox
samples from admitted pointer commands. Legacy periodic phase sampling is
disabled in this build so it does not add competing timestamp work.

Use ordinary play on the physical watch. Durations are watch-side wall
time, including any preemption. An isolated long span localizes where to
investigate. A repeated long span correlated with its workload is stronger
evidence of a computation bottleneck. Game rules and the timing policy use
the same admission timestamp as 2.3.38.

## Full dispatch and contact probes in 2.3.40

Full event dispatch now covers spawning quanta. The lighter path records
contact probe time and count separately, including pose-only non-spawn
TILT quanta. The existing skipped count includes those lighter quanta;
full plus skipped counts still equals total executed logical steps.
Probe and full-step timings both include their respective exact contact
time. The pointer inbox count describes capture volume and the input
drain duration covers frame-side counter handling. Bounded compaction
now takes place at native delivery, outside the measured timer callback.

The Android Bridge installed 2.3.39/code 90 on physical Balance 2 on November 7, 2026. The instrumented source commit is `996703a`. A native SWIPE run confirmed both slow-update records survive export and decoding.

The Android Bridge installed 2.3.40/code 91 on the physical Balance 2 on November 7, 2026. The installed application uses source commit `e859368`. Native firmware decoded the new probe fields after an ordinary IMG SWIPE run.

## Whole-window work counters in 2.3.41

The compact work record adds clearWindows and clearWindowQuanta.
The latter sums potential canonical candidate instants in the discarded
windows. Different windows can overlap, so this is not a count of
executed probes saved. Compare probeQuanta directly for the remaining
probe workload. Existing physical records retain their original meaning.

The Android Bridge installed 2.3.41/code 92 on physical Balance 2 on November 7, 2026. The installed application uses source commit `8cc36ad`. Native SWIPE run 20 verified ordinary gameplay and the new work record.
