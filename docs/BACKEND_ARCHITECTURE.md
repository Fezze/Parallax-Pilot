# Parallax Pilot Backend Architecture

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
- `Side Service` in Zepp mobile app: fetches backend data, stores caches in settings storage
- `Backend API`: accepts scores, exposes global/daily/seasonal leaderboards, returns best score and rank classification

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
- LocalStack exposes DynamoDB, SQS, and S3 endpoints
- Spring `local` profile points AWS clients to LocalStack
- Startup bootstrap creates required tables and queues if missing

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

## Ranking Model
- Canonical best score is maintained independently for `global`, `daily`, and `seasonal`.
- Tie-break is higher score first, then earlier submission timestamp, then player id.
- Top-N reads are exact.
- Classification is exact when rank is known in projection range; otherwise approximate band is returned.
- Daily scope uses UTC day key.
- Seasonal scope uses quarter key: `YYYY-QN`.

## Zepp Companion Design
### Settings App
- Renders cached leaderboard data from settings storage
- Allows scope switching between global, daily, and seasonal
- Shows last sync time, player best, and rank classification
- Triggers refresh by writing a command into settings storage

### Side Service
- Listens for settings storage commands
- Fetches leaderboard data from backend
- Stores read caches back into settings storage
- Is the only online client in the Zepp ecosystem for this feature

## Operational Notes
- Every submission is idempotent by `submissionId`
- Rebuild is possible from append-only submission log
- Wrong-rank debugging starts from submission record, best-score record, and scope projection
- Burst load is absorbed with queue-based projection flow in the target architecture; local implementation keeps a synchronous fallback path for simplicity

## Implementation Status In Repo
- `backend/`: Spring Boot service scaffold with DynamoDB-backed repositories and LocalStack profile
- `zepp-app/app-side/`: phone-side online sync service
- `zepp-app/setting/`: phone leaderboard UI inside Zepp app
- `tests/playwright/`: screenshot coverage extended for the phone leaderboard screen
