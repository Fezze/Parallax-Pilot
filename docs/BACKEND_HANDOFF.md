# Backend Handoff

This note is for the next AI taking over backend work in this repo.

Start with `docs/AI_TAKEOVER.md` for the full AI-oriented documentation set.

## Current Baseline
- Latest backend-related commit: `5e9e03a Add backend ops and score submit flow`.
- The repo has Maven Wrapper support under `backend/` and npm scripts for backend builds/tests.
- Zepp watch score submit is wired through BLE/messaging into `Side Service`.
- `Side Service` keeps an offline submit queue in `settingsStorage` and posts to `POST /v1/scores:submit`.
- Backend API has idempotent submit, async SQS projection, projection dedupe, replay rebuild, active season cutover, S3 snapshot export, and submission debug endpoint.
- Projection worker runtime exists as `ProjectionWorkerApplication` plus `worker` profile; default API profile does not run scheduled projection draining.
- Baseline Terraform exists in `infra/terraform/` for DynamoDB, SQS, S3 snapshots, CloudWatch log groups, and ECR repos.
- Baseline CI exists in `.github/workflows/backend.yml`.
- App build currently bumps watch app version; current version after validation is `2.4.5`, code `61`.

## Validation Already Run
- `cmd /c npm test` passed: 52 tests.
- `cmd /c npm run backend:test` passed: 12 tests.
- `cmd /c npm run build` passed and bumped the Zepp app version to `2.4.5`/`61`.
- `cmd /c npm run build:backend` passed.
- `cmd /c npm run backend:verify` still does not pass in this Codex environment because Testcontainers cannot access Docker.

## Docker / Full Verify Status
- Docker Desktop was installed through `winget`, but Docker Engine is not usable from the Codex process yet.
- `com.docker.service` was still stopped after install.
- The active Codex user is `PC\codexsandboxonline`; the local `docker-users` group only contained `PC\krzys`.
- Adding the Codex user to `docker-users` was rejected by the user.
- User explicitly said to skip Docker for now and continue with work that can be done without Docker.
- Do not mark integration verification as complete until `cmd /c npm run backend:verify` passes with Docker/Testcontainers.

## Still Missing Or Partial
- Backend-only versioning: backend-only builds still share workspace/package version behavior, and `npm run build` bumps the watch app.
- Player identity onboarding: `Settings App` and `Side Service` still use demo defaults (`demo-player`, `Pilot`) unless configured manually.
- Anti-abuse depth: current logic is player rate limit plus basic score/survival sanity; still missing device/IP throttling, version anomaly rules, replay-pattern heuristics, and richer admin workflows.
- Rank stability: tie-break logic exists, but equal-score/equal-time behavior needs explicit tests and docs across global/daily/seasonal scopes.
- Observability: logs and Micrometer counters exist, but no dashboard, alert rules, trace/correlation model, projection lag metric, or queue-depth alarm.
- S3 snapshots: export exists; restore, diff, and drift comparison tooling are not implemented.
- Admin/debug view: backend debug API exists; there is no UI screen. If a UI screen is added, add Playwright screenshot coverage per repo rules.
- Worker deployment: worker runtime/profile exists, but Terraform does not yet define ECS/App Runner services, task definitions, IAM roles, or separate API/worker deployment.
- CI/CD: workflow verifies only; no artifact publish, image build/push, environment promotion, Terraform plan/apply, approval gates, or secrets wiring.
- Terraform: baseline resources exist; remote state, locking, IAM least privilege, environment modules, and deploy targets are still missing.
- Offline queue hardening: watch and side queues exist, but need physical/simulator verification of BLE messaging, retry backoff, queue TTL, and user-visible submit status.
- LocalStack tests: full integration tests are still Docker-dependent and were skipped per user instruction for now.

## Recommended Next Plan
1. Backend-only versioning.
   - Split backend release/build metadata from watch app versioning.
   - Ensure backend-only changes do not bump `zepp-app/app.json`.
   - Add docs for when to run `npm run build` vs backend-only build scripts.

2. Docker/Testcontainers verification, only when user wants it resumed.
   - Fix Docker access for the active execution user or run Codex under a user in `docker-users`.
   - Start Docker Desktop/Engine.
   - Run `cmd /c npm run backend:verify`.
   - Fix any real integration failures; do not hide them by skipping tests.

3. Deployment shape.
   - Extend Terraform with IAM roles/policies, ECS/App Runner services, API and projection worker task definitions, Parameter Store/Secrets Manager config, and autoscaling.
   - Add GitHub Actions image build/push and environment promotion.

4. Observability.
   - Add timers for submit/read/projection paths.
   - Add projection queue lag/depth metric.
   - Add health/readiness endpoints that check DynamoDB/SQS/S3.
   - Add CloudWatch dashboard and alarms in Terraform.

5. Product identity.
   - Replace demo player defaults with an install/player identity onboarding flow in Settings App.
   - Keep anonymous identity lightweight, but make it stable and explicit.

6. Ranking and abuse hardening.
   - Add equal-score tie tests.
   - Add richer suspicious-signal rules.
   - Add admin endpoints for risk review and quarantine release if needed.

7. Snapshot recovery and admin UI.
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
