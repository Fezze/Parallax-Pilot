# Parallax Pilot Backend Architecture

Audience: AI agents only. Human-facing documentation belongs only in `README.md` files.

## Summary
Parallax Pilot keeps gameplay on the watch and moves networked leaderboard concerns into the Zepp phone companion stack. The watch remains the game runtime. The phone-side `Settings App` is the leaderboard UI, the Zepp `Side Service` is the online client, and a Spring Boot backend on AWS is the system of record for submissions, best scores, and leaderboard reads.

This design avoids a separate mobile app while still using a production-shaped backend:
- Spring Boot API for submission and read contracts
- DynamoDB as the primary operational store
- SQS for asynchronous projection and replay-ready ingestion
- S3 for snapshots and rebuild support
- LocalStack for local AWS emulation

## Architecture
### Runtime split
- `Device App` on the watch: gameplay, local history, offline-first session data
- `Settings App` in Zepp mobile app: leaderboard UI
- `Side Service` in Zepp mobile app: receives watch submissions over BLE messaging, keeps an offline submit queue, posts scores, fetches leaderboard data, and stores caches in settings storage
- `Backend API`: accepts scores, exposes global/daily/seasonal leaderboards, returns best score and rank classification
- `Projection Worker`: same backend package with `worker` profile; drains SQS projections outside the API runtime

### Trust model
- The score originates on an untrusted client path.
- The backend accepts only shape-valid, rate-limited, idempotent submissions.
- Anti-cheat is hardening, not proof.
- Suspicious traffic is flagged, not treated as cryptographically trustworthy.

### Data ownership
- `score_submissions` is append-only and replayable.
- `best_scores` is the player-facing source for canonical per-scope best result.
- `leaderboard_entries` is a projection optimized for top-N reads.
- `classification` is a read optimization that may return exact rank or approximate band.

## AWS Mapping
### Core services
- API: Spring Boot on ECS Fargate or App Runner
- Database: DynamoDB
- Queue: SQS
- Object storage: S3
- Metrics/logs: CloudWatch + Micrometer
- Secrets/config: AWS Parameter Store or Secrets Manager

### Local development
- LocalStack is a dev/test dependency, not part of the main runtime package
- local run assets live under `backend/dev/localstack/`
- integration tests use LocalStack containers to create DynamoDB, SQS, and S3 resources on demand

## API Surface
### Write path
- `POST /v1/scores:submit`
  - request: `submissionId`, `playerId`, `nickname`, `score`, `survivedMs`, `playedAt`, `clientVersion`, `deviceModel`
  - response: accepted status, whether best score changed, scope snapshots

### Read path
- `GET /v1/leaderboards/global`
- `GET /v1/leaderboards/daily`
- `GET /v1/leaderboards/seasonal`
- `GET /v1/players/{playerId}/best`
- `GET /v1/rankings/classify?playerId=...`
- `POST /v1/scores:submit` also returns a submitted-round classification snapshot that is distinct from player-best classification
- `POST /v1/admin/projections:drain`
- `POST /v1/admin/projections:rebuild`
- `POST /v1/admin/snapshots:export`
- `GET /v1/admin/submissions/{submissionId}/debug`

## Ranking Model
- Canonical best score is maintained independently for `global`, `daily`, and `seasonal`.
- Tie-break is higher score first, then higher `survivedMs`, then earlier submission timestamp, then player id.
- Top-N reads are exact.
- Classification is exact when rank is known in projection range; otherwise approximate band is returned.
- Submit responses explicitly separate the hypothetical rank of the submitted round from the current player-best rank view.
- Submitted-round classification is estimated from the bounded projection and replaces the same player's existing projected best conceptually instead of double-counting that player.
- Daily scope uses UTC day key.
- Seasonal scope uses quarter key: `YYYY-QN`.

## MVP versus global-scale ranking
- The current repo implements an MVP read path: bounded projection scans plus top-N materialized leaderboard entries.
- That is intentionally honest about scale. Exact answers are cheap near the top of the leaderboard window, while deeper ranks degrade to approximate bands.
- The design target still assumes eventual global-scale traffic, but the current code is not pretending to already be a globally exact ranking system.
- The write path is already shaped so the read path can evolve later into sharded projections, bucketed rank estimation, or a dedicated ranking store without redesigning score ingestion.

## Zepp Companion Design
### Settings App
- Renders cached leaderboard data from settings storage
- Allows scope switching between global, daily, and seasonal
- Shows last sync time, player best, and rank classification
- Triggers refresh by writing a command into settings storage

### Side Service
- Listens for settings storage commands
- Listens for watch BLE/messaging submit events
- Stores failed submits in settings storage until the phone can reach the backend
- Fetches leaderboard data from backend
- Stores read caches back into settings storage
- Is the only online client in the Zepp ecosystem for this feature

## Operational Notes
- Every submission is idempotent by `submissionId`
- Rebuild is possible from append-only submission log
- Wrong-rank debugging starts from submission record, best-score record, and scope projection
- Wrong-rank debugging is exposed through `GET /v1/admin/submissions/{submissionId}/debug`
- Recovery snapshots are exported through `POST /v1/admin/snapshots:export`
- Burst load is absorbed with queue-based projection flow; the worker profile owns scheduled queue draining
- `/v1/admin/**` is protected with a shared admin token header and is intentionally outside the public API surface
- Every response carries `X-Request-Id` for correlation across logs and API clients.

## Implementation Status In Repo
- `backend/`: Spring Boot service scaffold with DynamoDB-backed repositories
- `backend/dev/localstack/`: local-only LocalStack runtime assets
- `backend/src/test/`: LocalStack-based integration test coverage
- `zepp-app/app-side/`: phone-side online sync service
- `zepp-app/shared/leaderboard-submit.js`: watch/phone submit queue contract
- `zepp-app/setting/`: phone leaderboard UI inside Zepp app
- `.github/workflows/backend.yml`: backend verification workflow
- `infra/terraform/`: AWS baseline for backend resources
- `tests/playwright/`: screenshot coverage extended for the phone leaderboard screen
