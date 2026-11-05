# Physical runtime diagnostics: temporary 2.3.29 build

This build observes the current 2.3.28 simulation architecture. It does not change
the requested 16 ms timer, 10 ms simulation quantum, collision geometry, input
commands, scoring, visual detail or the 250 ms interruption policy. Diagnostics
must be removed or disabled before the ordinary release following this study.

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
even indices additionally sample one in thirteen world steps. The mode and game
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
truncated longer messages during verification. Histogram bounds are stored once
in histogramBins; incomplete reports must never be treated as valid samples.

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
- Asteroid visits, candidate counts, pointer events and idle/held/moving groups.
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
4. Decode PP_DIAG chunks with scripts/decode-runtime-diagnostics.mjs. Incomplete
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
