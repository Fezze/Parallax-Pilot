Reduce output to minimum, only important things.

Project rules:
- Every new screen or page must get at least one new Playwright screenshot scenario.
- Validation for any new screen includes checking how that screen looks in generated screenshots, not only whether tests pass.
- Keep screenshot coverage aligned with supported locale, shape, and resolution matrices already used by the repo.
- After finishing a code change, always run a build as part of the close-out validation.
- After every successful build, create a commit before moving on.

Workflow for simulator harness:
- `npm run sim:doctor`
- `npm run dev`
- `npm run sim:smoke`
- `npm run build`
