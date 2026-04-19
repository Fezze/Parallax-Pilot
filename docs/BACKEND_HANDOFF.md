# Backend Handoff

Audience: AI agents only. Human-facing documentation belongs only in `README.md` files.

This note is for the next AI taking over backend work in this repo.

Start with `docs/TAKEOVER.md` for the full agent-oriented documentation set.

## Current Baseline
- Latest backend-related commit before this unfinished working tree: `b1eb7c5 Expand Zepp harness coverage for services and bootstrap`.
- The repo has Maven Wrapper support under `backend/` and npm scripts for backend builds/tests.
- Zepp watch score submit is wired through BLE/messaging into `Side Service`.
- `Side Service` keeps an offline submit queue in `settingsStorage` and posts to `POST /v1/scores:submit`.
- Backend API has idempotent submit, async SQS projection, projection dedupe, replay rebuild, active season cutover, S3 snapshot export, and submission debug endpoint.
- Projection worker runtime exists as `ProjectionWorkerApplication` plus `worker` profile; default API profile does not run scheduled projection draining.
- Baseline Terraform exists in `infra/terraform/` for DynamoDB, SQS, S3 snapshots, CloudWatch log groups, and ECR repos.
- Terraform runtime shape now also includes ECS/ALB/IAM definitions for API and projection worker plus `backend/Dockerfile`.
- Terraform runtime shape now also includes env/secrets wiring and ECS autoscaling scaffolding.
- Terraform main stack now also expects `s3` remote state with DynamoDB locking, and the bootstrap resources for that live under `infra/terraform/bootstrap-state/`.
- Baseline CI exists in `.github/workflows/backend.yml`.
- CI can now optionally publish backend images to ECR on `main` and run a manual Terraform plan via `workflow_dispatch`.
- CI can now also roll ECS services to newly registered task definition revisions after publishing SHA-tagged images.
- `npm run build` is now a neutral validation build; `npm run build:app` is the explicit watch release build with version bump.
- Current watch version remains `2.4.5`, code `61` until the next explicit `build:app` run.
- Anonymous identity onboarding replaced `demo-player` / `Pilot` defaults in the active code.

## Validation Already Run
- `cmd /c npm test` passed: 66 tests.
- `npx c8 --all --src zepp-app --exclude tests/** --reporter=text node --import ./tests/register-zepp-globals.mjs --test` passed: `86.4%` statements / `82.09%` branches / `85.04%` functions for `zepp-app`.
- `cmd /c npm run test:playwright:screens` passed: 140 tests.
- Updated phone leaderboard screenshots were reviewed manually.
- `cmd /c npm run build` passed without bumping the Zepp app version.
- `cmd /c npm run build:backend` passed.
- `docker build -f backend/Dockerfile backend` passed locally after preparing `backend/target/app.jar`.
- `cmd /c npm run backend:verify` passed: 34 backend tests with Docker/Testcontainers.

## Docker / Full Verify Status
- Docker/Testcontainers are usable in the current environment.
- Two real test issues were fixed while closing full verify:
  - `ProjectionConcurrencyIntegrationTest` no longer deadlocks on its start latch.
  - `LocalStackIntegrationSupport` now forces Spring to rebuild context after each integration class, preventing stale AWS client endpoints across restarted LocalStack containers.

## Still Missing Or Partial
- Anti-abuse depth: current logic is player rate limit plus basic score/survival sanity; still missing device/IP throttling, version anomaly rules, replay-pattern heuristics, and richer admin workflows.
- Rank stability: tie-break logic exists, but equal-score/equal-time behavior needs explicit tests and docs across global/daily/seasonal scopes.
- Observability: logs and Micrometer counters exist, but no dashboard, alert rules, trace/correlation model, projection lag metric, or queue-depth alarm.
- S3 snapshots: export exists; restore, diff, and drift comparison tooling are not implemented.
- Admin/debug view: backend debug API exists; there is no UI screen. If a UI screen is added, add Playwright screenshot coverage per repo rules.
- Worker deployment: runtime shape exists in Terraform, but environment modules, alarms, and production apply discipline are still missing.
- CI/CD: image publish, manual plan, and ECS rollout now exist, but there is still no environment promotion, Terraform apply, or approval gates.
- Terraform: bootstrap for remote state and managed secrets resources now exist, but validated real plan/apply and environment modules are still missing.
- Offline queue hardening: watch and side queues exist, but need physical/simulator verification of BLE messaging, retry backoff, queue TTL, and user-visible submit status.

## JS Coverage Notes
- `zepp-app/setting/index.js` is now covered through Node harness tests.
- `zepp-app/app-side/index.js` is now covered through Node harness tests with mocked `@zos/fetch`, `@zos/settings`, and peer socket messaging.
- `zepp-app/shared/leaderboard-device-bridge.js` is now covered with a fake BLE adapter.
- `zepp-app/app.js` root bootstrap is now covered with a mocked `@zos/ble` module.

## Recommended Next Plan
1. Deployment shape.
   - Finish Terraform with validated real plan/apply path and environment modules.
   - Add environment promotion, approval gates, and stronger ECS rollout validation on top of the new image publish path.

2. Observability.
   - Add timers for submit/read/projection paths.
   - Add projection queue lag/depth metric.
   - Add health/readiness endpoints that check DynamoDB/SQS/S3.
   - Add CloudWatch dashboard and alarms in Terraform.

3. Ranking and abuse hardening.
   - Add equal-score tie tests.
   - Add richer suspicious-signal rules.
   - Add admin endpoints for risk review and quarantine release if needed.

4. Snapshot recovery and admin UI.
   - Add snapshot restore/diff tooling before relying on S3 export operationally.
   - If building admin UI, add Playwright screenshot scenarios for every new screen, matching existing locale/shape/resolution matrices.

## Useful Entry Points
- Backend API controller: `backend/src/main/java/com/parallaxpilot/leaderboard/api/LeaderboardController.java`
- Submit/rebuild logic: `backend/src/main/java/com/parallaxpilot/leaderboard/service/LeaderboardService.java`
- Projection worker: `backend/src/main/java/com/parallaxpilot/leaderboard/ProjectionWorkerApplication.java`
- Projection scheduler gate: `backend/src/main/java/com/parallaxpilot/leaderboard/service/ProjectionQueueConsumer.java`
- Snapshot export: `backend/src/main/java/com/parallaxpilot/leaderboard/service/SnapshotService.java`
- Zepp submit contract: `zepp-app/shared/leaderboard-submit.js`
- Watch BLE bridge: `zepp-app/shared/leaderboard-device-bridge.js`
- Side Service sync/queue: `zepp-app/app-side/index.js`
- Terraform baseline: `infra/terraform/`
- Backend workflow: `.github/workflows/backend.yml`
