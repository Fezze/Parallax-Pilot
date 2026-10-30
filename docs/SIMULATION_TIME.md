# Simulation time

Gameplay advances in fixed 10 ms steps. Ship and asteroid motion, spawn timing,
difficulty, damage cooldowns, HP animation and survival score all use this age.
The presentation timer still requests a frame every 16 ms and draws once per
callback, regardless of how many simulation steps were needed. No new native
API or dependency is required (manifest v3, target API 4.0, minimum API 3.6).

## Delays and interruptions

- Positive callback gaps up to and including 250 ms are fully accumulated. Each
  step consumes 10 ms; the remainder is retained for the next update. This
  permits at most 25 steps per update, including a pre-existing remainder.
- A gap above 250 ms is paused in full. Nothing in the world advances during
  that gap, including score, cooldowns and spawn deadlines. There is no catch-up
  debt. A pre-existing remainder below 10 ms is preserved. Normal progression
  resumes on the next ordinary gap; repeated long gaps keep the game paused.
- Duplicate, nonfinite or backward clock readings do not advance gameplay.
  Backward readings retain the previous high-water mark, preventing time from
  being replayed when the clock recovers. Forward clock changes above the gap
  limit follow the interruption policy.
- The first fatal step ends the run immediately and discards pending work.
  Persisted duration and score use simulation age; persisted timestamps retain
  their existing wall-clock meaning. A callback ending the run does not render
  after navigating to results.

Ten milliseconds gives two to twenty collision checks across the audited
ordinary 16–200 ms callbacks, rather than replacing them with a large motion
jump. The 250 ms admission limit covers the required 200 ms schedule with a
small jitter allowance while keeping a hard work bound. These are correctness
and interruption-policy choices, not measured optimal watch-performance values.
This change does not replace R3's collision geometry/continuity work, including
the existing grid omissions and potential tunneling at extreme late-run speeds.

## Input and reproducibility

Pointer down/move/up advances pending time before changing the current input.
Thus a release between timer callbacks does not erase the preceding held input.
Tilt uses the existing sensor's current reading at each simulation step. The
app cannot reconstruct physical sensor changes that were never delivered; the
equivalence contract is for the same supplied input and random traces.

For identical traces and admitted elapsed time, world state at equal whole-step
ages is identical, including random spawn order, asteroid trajectories, damage
and score. At arbitrary presentation instants simulation age may lag admitted
time by less than 10 ms. Input changes are applied at the next simulation step;
there is no added interpolation or alteration of swipe semantics.

`tests/game-simulation.test.js` exercises the actual page, timer, UI events,
collision grid, spawning, damage, navigation and persisted score at 16, 33, 50,
100, 200 ms and irregular callback intervals. Full-minute probes retain actual
damage with extra HP to expose progression; a separate normal-HP replay checks
natural game over. Browser tests exercise the page with mocked Zepp APIs and
the existing screenshot matrix remains applicable. Neither browser tests nor
builds establish physical watch FPS, CPU use, energy cost or sensor feel.
