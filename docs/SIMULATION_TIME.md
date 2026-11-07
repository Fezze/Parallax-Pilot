# Simulation time

Gameplay advances in fixed 10 ms steps. Ship and asteroid motion, spawn timing,
difficulty, damage cooldowns, HP animation and survival score all use this age.
The presentation timer still requests a frame every 16 ms and draws once per
callback, regardless of how many simulation steps were needed. No new native
API or dependency is required (manifest v3, target API 4.0, minimum API 3.6).

## Batched world work and presentation

The 10 ms timeline does not require a full asteroid-array/grid update on every
quantum. Asteroids retain an immutable birth position/time and constant velocity.
Each callback selects a conservative horizontal sweep set once. Only that set
is advanced and tested against the ship at the original canonical instants;
vertical input reversals and clamping cannot escape this horizontal selection.
The complete scene is materialized once after the callback and immediately
before an actual spawn. Spawning sees the preceding quantum, then the newborn
receives its first 10 ms movement, preserving the original operation order.
Grid slot ordering is bookkeeping; independent membership/contact tests cover it.

The renderer interpolates the previous/current canonical ship and health state,
and evaluates asteroid positions at the same presentation instant. This adds
at most one simulation quantum of presentation delay and removes alternating
10/20 ms displayed motion under regular 16 ms callbacks. Floating render points
never feed back into collision geometry, control positions, damage or scoring.
Static preview callers can still draw an explicitly supplied ship rectangle.

Analytic positions avoid callback-dependent accumulation error. Comparison with
the former repeated additions uses subpixel floating-point tolerance; canonical
contact/cooldown/fatal-step events remain tested independently.

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
R3 adds conservative swept grid queries and continuous relative-motion collision
against the visible arrow; see `COLLISION_GEOMETRY.md`. The 10 ms clock and its
interruption/cooldown policies remain unchanged.

## Input and reproducibility

Pointer down/move/up records timestamped commands without advancing the world.
The presentation callback consumes those commands in time order, advancing the
same fixed simulation steps before each effective input change. Thus a release
between timer callbacks does not erase the preceding held input, while a burst
of pointer events cannot run collision/spawn work inside the input handlers.
The frame owner alone decides whether a gap is admitted or paused; active
touch cannot bypass the 250 ms interruption policy. Commands within one
simulation quantum are folded to their final pointer state/swipe anchor in a
bounded reusable pool. Long waiting gaps retain only the final state and anchor.
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

## Canonical event segments

The clock can admit one block of whole10ms quanta with the same carry, rollback and250ms pause rules. The page processes touch/swipe input segments at exact spawn/contact boundaries and advances quiet intervals using repeated scalar control additions. No physics event is moved to a presentation boundary. Newborns receive their first movement quantum immediately; a fatal event stops the block and clears pending time.

An unchanged ship pose no longer rewrites five vertices every quantum. Quiet segments preserve separate previous/current canonical rectangles and the final two HP values, including the first stationary quantum after movement. Tilt retains per-quantum reads because sensor traces are part of its existing control contract; geometry caching and scheduled spawning still apply.

The next spawn quantum is solved from the current difficulty/interval equation, then checked at adjacent lattice points using the original predicate. Retained debt schedules at the next unprocessed quantum. Collision windows conservatively include both spatial rounding and the preceding sweep; only the existing10ms narrow phase determines damage. Logical steps include quiet quanta, while eventQuanta/skippedQuanta expose how much full dispatch was avoided.

## Damage eligibility inside contact windows

A spatial contact window does not wake a full step while that asteroid remains inside its 260 ms damage cooldown. Cached windows keep the asteroid reference, so a hit immediately moves the next eligible quantum even within the same admitted block. The inclusive readiness boundary is rounded up to the canonical lattice. Each asteroid keeps its own deadline; births and other ready contacts still wake independently. Motion and HUD continue analytically between those events.

## Swipe speed and input work

In 2.3.37, a swipe selects a position relative to its press anchor. The ship
approaches that target at the same maximum speed as touch and stops there.
Release keeps the target, even for a gesture fully delivered between two
simulation steps. A new press anchors at the actual position and can cancel or
reverse the remaining motion. Quiet spans and swept collision windows both
follow the capped trajectory.

A move to the same target does not split a block. A changed target can also
share the block when both old and new targets are in the same direction and
beyond the maximum distance the ship could travel for the rest of the frame,
with one extra quantum of margin. Reversals and reachable targets retain their
timed boundaries. No additional timer runs for swipes.

## Fixed geometry and terminal scoring

The 2.3.38 gameplay path needs only damage or zero from a swept contact.
It shares the existing polygon and threshold math, rejects ineligible
asteroids before the exact test and stops at the first qualifying edge.
The overlap-ratio helper remains available for callers that need it.
Difficulty is evaluated when a spawn becomes due. The exact spawn
selection, random sequence and damage cooldown remain tied to game time.

The viewport and wrist determine the round or square HUD geometry, static
ship coordinates, and the tilt normalization parameters before the run.
Asteroid sprites are packaged assets. Their vertical position is fixed when
the IMG view first receives an asteroid. Runtime retention uses previous X
only where the current X does not decide it, while contact checks still use
both canonical positions.

The fatal step captures the exact elapsed simulation time and wall
timestamp and stops the game timer. A one-shot callback calculates the
score and writes the existing history format before opening results.
Teardown consumes an outstanding result before the page exits. Normal
results receive the completed entry through route parameters.

## Contact-only quanta in 2.3.40

The existing window scheduler still selects a canonical candidate instant.
At a non-spawn instant, the game advances one ship pose and checks only
eligible windows using the exact swept collision test. It no longer runs
the complete spawn and world-dispatch path for a miss or a hit. Spawning
keeps its original complete step and checks newborns immediately. If
time remains in the block, the scheduler appends windows for newborns
and retains conservative windows for the rest of the scene.

TILT retains its per-quantum sensor reads and uses the lighter path on
non-spawn quanta. Native touch delivery stages commands directly into the
bounded pool, preserving existing coalescing and timestamp rules. Only the
timer advances time and submits the picture. A truly frozen callback
skips the same-time scene scans and publication; a changed interpolation
remainder still draws.

## Whole-window rejection in 2.3.41

After finding a conservative candidate window and clipping it to initial
cooldown readiness, TOUCH and SWIPE can reject a multi-quantum interval
as a unit. The asteroid sweep starts one quantum before the first
possible test. For stationary motion it is checked against the fixed
rounded polygon. For moving segments a relative endpoint chord is
expanded by the bound for canonical Y rounding, numerical error and a
possible bend at the stop or movement limit.

Every canonical sweep lies in that expanded path because its endpoints
are covered and the interpolation between them is linear. A positive
separation can remove the window. Remaining candidates use the original
exact tests at the original quanta. Input segment boundaries, spawning,
TILT reads, damage, and fatal scoring retain their chronology.
