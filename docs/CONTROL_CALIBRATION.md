# Control and calibration contract

Accelerometer Y is consumed in the documented `cm/s^2` unit. Left wrist uses raw
Y; right wrist negates it. In that oriented frame positive displacement from the
neutral mean moves the ship down, and negative displacement moves it up. Guided
stage prompts, endpoint extraction and gameplay all use this same convention.

Profile version 2 records the unit, frame and wrist explicitly. Stored v1,
unknown versions, different units/frames and profiles for the other wrist are
unusable. Existing storage keys are retained for compatibility, but their old
contents are never silently reinterpreted. Switching back to a wrist restores
its saved profile if still present; a successful calibration for another wrist
replaces the single stored profile. Home and direct game entry require a usable
tilt profile. Touch and swipe remain available in settings without calibration.

Each stage requires consecutive settled raw samples. Existing raw stability
limits (18 for center, 16 for endpoints, in cm/s^2) are retained. The neutral mean
and its maximum noise excursion establish the offset and deadzone (2.4 times
center noise, with 0.01 cm/s^2 as a numerical minimum). The accepted
down mean minus neutral is the positive span; neutral minus the accepted up mean
is the negative span. Both spans must exceed the stability envelope and three
times deadzone/settled noise. There are no fabricated minimum spans, angle
assumptions, range caps or overshoot-based gain. Noisy, weak or wrong-direction
attempts fail instead of creating a profile. Raw transition spikes are excluded.

Gameplay subtracts the neutral offset, removes the deadzone and linearly maps
the remaining directional span to [-1, 1]. Neutral is zero; half of the usable
span is half input. Invalid readings give zero input. Physical comfort, resting
pose and hardware noise still need watch/user validation; firmware sensor mocks
verify the numerical contract rather than ergonomic feel.

The stability window holds at most 10 samples and each accepted stage holds at
most 32. A stage times out after 30 seconds, releases its timer/sensor and offers
retry/cancel. Failed/cancelled attempts preserve the last stored profile and
report. Reports retain only known scalar diagnostics and at most 32 samples per
stage on write and read. Full diagnostics are saved only when the existing
calibration-logs feature is enabled. Lifecycle exit stops acquisition immediately.

Touch speed retains the pre-calibration sensitivity setting and is independent
of tilt profile presence, validity or wrist. Swipe maps drag displacement to a
press-relative target, then approaches it at the touch speed cap. Swipe also
ignores calibration. Calibrated tilt uses the
measured spans and the common viewport-scaled control speed. R1 simulation time
and input-event timing remain intact.

Validation covers actual guided-page traces for both wrists, asymmetric spans,
neutral/intermediate input, noisy and wrong-direction waiting, retry/cancel,
persistence compatibility, bounded diagnostics, direct game entry and identical
touch/swipe event trajectories. Browser previews include initial/failure states
and entry guidance across both locales and all five existing device families.
Final native validation follows `NATIVE_SIMULATOR_VALIDATION.md`; sensor mocking
must be identified explicitly and cannot establish physical sensor feel.
