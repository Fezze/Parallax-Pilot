# Simulation time

Gameplay advances in fixed 10 ms steps. Ship and asteroid motion, spawn timing,
difficulty, damage cooldowns, HP animation and survival score all use this age.
The presentation timer still requests a frame every 16 ms and draws once per
callback, regardless of how many simulation steps were needed. No new native
API or dependency is required (manifest v3, target API 4.0, minimum API 3.6).

## Batched world work and presentation

The 10 ms timeline does not require a full asteroid-array/grid update on every
quantum. Asteroids retain an immutable birth position/time and constant velocity.
Each admitted callback selects a conservative horizontal sweep set once.
TOUCH and SWIPE test that set against cached exact ship poses at canonical
instants. TILT reads the sensor and tests its sweep at each canonical step.
A single traversal after the callback updates canonical positions, prunes
departed bodies and prepares asteroid images. At a real spawn, one additional
traversal commits the preceding scene instant and collects the spawn
neighborhood. Newborns receive their first 10 ms movement in the spawn step.

The renderer interpolates the previous/current canonical ship and health state,
and evaluates asteroid positions at the same presentation instant. This adds
at most one simulation quantum of presentation delay and removes alternating
10/20 ms displayed motion under regular 16 ms callbacks. Floating render points
never feed back into collision geometry, control positions, damage or scoring.
A changed fractional remainder prepares a new image without advancing the
scene. An unchanged paused frame does no scene work. IMG views are attached
to presentation records and returned to the pool through a retirement queue.
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

The 10 ms lattice preserves intermediate contacts across ordinary 16–200 ms
callbacks, including sweeps whose endpoints at the presentation cadence miss. The 250 ms admission limit covers the required 200 ms schedule with a
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
spawning, damage, navigation and persisted score at 16, 33, 50,
100, 200 ms and irregular callback intervals. Full-minute probes retain actual
damage with extra HP to expose progression; a separate normal-HP replay checks
natural game over. Browser tests exercise the page with mocked Zepp APIs and
the existing screenshot matrix remains applicable. Neither browser tests nor
builds establish physical watch FPS, CPU use, energy cost or sensor feel.

## Contact batches

Effective input changes and spawn quanta bound each TOUCH or SWIPE segment.
The game computes conservative collision windows, clips them to each asteroid's
260 ms cooldown and discards whole windows that are provably clear. When any
window survives, it computes each rounded ship pose and swept bound once,
using the same repeated scalar additions as 10 ms stepping.

The exact arrow/circle sweep finds the first hit for each eligible asteroid.
A 250 ms admission cannot contain two hits on the same body. Hits are grouped
by canonical quantum in candidate order. Committing a group applies all its
damage and cooldown changes before checking for game over. The displayed HP
advances once for that quantum, even when fatal. Hit-free spans retain the
last two canonical poses and HP values for interpolation.

Spawn quanta keep the original operation order and exact sweep. TILT retains
per-quantum sensor sampling and shares the spawn, scene and presentation
paths. The spawn deadline uses the original difficulty and interval predicate
on the 10 ms lattice.

## Swipe speed and input work

A swipe selects a position relative to its press anchor. The ship
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
