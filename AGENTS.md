Reduce output to minimum, only important things.

Project rules:
- Every new screen or page must get at least one new Playwright screenshot scenario.
- Validation for any new screen includes checking how that screen looks in generated screenshots, not only whether tests pass.
- Keep screenshot coverage aligned with supported locale, shape, and resolution matrices already used by the repo.
- Simulator automation must not move or warp the user's host cursor or steal keyboard focus. Use the verified native input adapter and revalidate its target window/process before each action. Host cursor input requires explicit advance user consent; it is disabled by default.
- Final validation of every code change must include at least one run in the actual Zepp OS Simulator with the current application deployed. Exercise the affected behavior, inspect native screenshots and runtime logs, and record the device profile, app version, steps and results. Simulator readiness checks, dry runs, browser mocks and successful builds do not satisfy this requirement. If execution is blocked, record the concrete blocker and leave simulator validation explicitly incomplete; do not mark the change fully validated.
- After finishing a code change, always run a build as part of the close-out validation.
- After every successful build, create a commit before moving on.

Native simulator handoff: read `docs/NATIVE_SIMULATOR_VALIDATION.md` before the first run, especially after a restart. It records the verified capture path, guided-input fallback and acceptance evidence.

Workflow for simulator harness:
- `npm run sim:doctor`
- `npm run dev`
- `npm run sim:smoke`
- `npm run build`
