# AI Architecture Map

Ten dokument opisuje architekturę repo tak, żeby agent mógł wejść w pracę bez reverse engineeringu.

## System Overview
Parallax Pilot to gra na zegarek Zepp. Gameplay jest lokalny na zegarku. Leaderboard jest realizowany przez telefon i backend:

- Watch `Device App`: gra, lokalny score history, offline queue submitów.
- Zepp `Side Service`: bridge online, odbiera submity z watch, wysyła HTTP do backendu, odświeża cache leaderboardu.
- Zepp `Settings App`: UI leaderboardu w aplikacji Zepp na telefonie.
- Spring Boot Backend API: system of record dla submissions, best scores i odczytów leaderboardu.
- Projection Worker: osobny runtime tej samej aplikacji backendowej, drenuje SQS do `leaderboard_entries`.
- AWS resources: DynamoDB, SQS, S3, CloudWatch, ECR.

## Runtime Flow: Score Submit
1. `zepp-app/page/game/index.js` kończy run i tworzy `scoreEntry`.
2. `queueLeaderboardScore()` buduje backendowy `SubmitScoreRequest`.
3. Watch zapisuje submission do lokalnej kolejki.
4. `leaderboard-device-bridge.js` wysyła submission przez BLE/messaging.
5. `zepp-app/app-side/index.js` odbiera wiadomość.
6. Side Service zapisuje submission do `settingsStorage` queue.
7. Side Service robi `POST /v1/scores:submit`.
8. Backend zapisuje append-only `score_submissions`.
9. Backend aktualizuje `best_scores` conditional write.
10. Jeśli best score się zmienił, backend publikuje tasks do SQS dla global/daily/seasonal.
11. Worker drenuje SQS i aktualizuje `leaderboard_entries`.
12. Side Service może odświeżyć leaderboard cache.

## Runtime Flow: Leaderboard Read
1. Settings App zapisuje command `leaderboard_command=refresh`.
2. Side Service listener odpala refresh.
3. Side Service najpierw próbuje flush submit queue.
4. Side Service pobiera:
   - `GET /v1/leaderboards/global?limit=10`
   - `GET /v1/leaderboards/daily?limit=10`
   - `GET /v1/leaderboards/seasonal?limit=10`
   - `GET /v1/players/{playerId}/best`
   - `GET /v1/rankings/classify?playerId={playerId}`
5. Side Service zapisuje odpowiedzi w `settingsStorage`.
6. Settings App renderuje cache.

## Runtime Flow: Projection Worker
1. API runtime ma `app.leaderboard.projection-consumer-enabled=false`.
2. Worker runtime startuje z profilem `worker`.
3. `ProjectionQueueConsumer` istnieje tylko, gdy property jest true.
4. Scheduler wywołuje `ProjectionService.drainProjectionQueue()`.
5. Worker pomija drain, gdy aktywny jest rebuild lock.

## Backend Domain Model
### `ScoreSubmission`
Append-only source of truth dla submitted runs.

Key access:
- partition: static submission partition
- sort: `submissionId`

Used by:
- rebuild projections
- debug endpoint
- snapshot export

### `BestScoreRecord`
Canonical best score per player and scope.

Scopes:
- `global`
- `daily`
- `seasonal`

Tie-break:
- higher score wins
- then higher survivedMs wins
- then earlier playedAt wins

### `LeaderboardEntry`
Projection optimized for top-N leaderboard reads.

Important:
- It is not source of truth.
- It can be rebuilt from `score_submissions`.
- Projection dedupe uses `submissionId#scope#scopeKey`.

### `RiskSignalRecord`
Anti-abuse evidence attached to submission.

Currently used for:
- rate-limit
- score threshold
- survival threshold

### `SeasonMetadataRecord`
Active/manual season metadata.

Used by:
- seasonal scope resolution
- manual cutover
- scheduled rollover safeguard

## Backend Package Map
### API
- `backend/src/main/java/com/parallaxpilot/leaderboard/api/LeaderboardController.java`
- `backend/src/main/java/com/parallaxpilot/leaderboard/api/dto/`
- `backend/src/main/java/com/parallaxpilot/leaderboard/api/advice/`

### Services
- `LeaderboardService`: submit, read, rebuild, season endpoints, debug endpoint.
- `ProjectionService`: idempotent processing from SQS to leaderboard projection.
- `ProjectionQueueConsumer`: scheduled queue drain, only when enabled.
- `SnapshotService`: S3 snapshot export.
- `SeasonService`: manual/automatic season handling.
- `AntiAbuseService`: current baseline abuse checks.

### Repositories
- `ScoreSubmissionRepository`
- `BestScoreRepository`
- `LeaderboardEntryRepository`
- `ProjectionQueueRepository`
- `ProjectionProcessedRepository`
- `ProjectionIndexRepository`
- `RiskSignalRepository`
- `SeasonMetadataRepository`
- `RateLimitRepository`
- `IdempotencyRepository`
- `RebuildLockRepository`
- `DynamoDbJsonRepository`

### Config
- `AwsConfig`
- `AwsProperties`
- `LeaderboardProperties`
- `JacksonConfig`
- `application.yml`

## Zepp Package Map
### Watch App
- `zepp-app/app.js`: initializes BLE bridge.
- `zepp-app/page/game/index.js`: queues submit after run finish.
- `zepp-app/shared/storage.js`: watch storage facade.
- `zepp-app/shared/leaderboard-device-bridge.js`: BLE/messaging client.
- `zepp-app/shared/leaderboard-submit.js`: shared message/queue contract.

### Phone Side Service
- `zepp-app/app-side/index.js`: command listener, HTTP client, submit queue, leaderboard refresh.

### Phone Settings App
- `zepp-app/setting/index.js`: leaderboard UI in Zepp app.

## Data Stores
### DynamoDB Tables
Created by LocalStack bootstrap and Terraform baseline:
- `pp_score_submissions`
- `pp_best_scores`
- `pp_leaderboard_entries`
- `pp_projection_index`
- `pp_projection_processed`
- `pp_idempotency`
- `pp_risk_signals`
- `pp_season_metadata`
- `pp_abuse_counters`
- `pp_admin_state`

### SQS
- Queue: `pp_score-submissions`
- Contains projection tasks, not raw score submissions.

### S3
- Bucket: `pp-leaderboard-snapshots`
- Contains JSON exports under `leaderboard-snapshots/`.

## API Surface
### Public/Client
- `POST /v1/scores:submit`
- `GET /v1/leaderboards/{scope}`
- `GET /v1/leaderboards/{scope}/around-me`
- `GET /v1/players/{playerId}/best`
- `GET /v1/rankings/classify`

### Admin/Ops
- `POST /v1/admin/projections:drain`
- `POST /v1/admin/projections:rebuild`
- `GET /v1/admin/seasons/active`
- `PATCH /v1/admin/seasons:cutover`
- `POST /v1/admin/snapshots:export`
- `GET /v1/admin/submissions/{submissionId}/debug`

## Config Profiles
### Default API Runtime
Defined in `backend/src/main/resources/application.yml`:
- `projection-consumer-enabled: false`
- API can still manually drain through admin endpoint.

### Worker Runtime
Profile:
- `worker`

Entrypoint:
- `ProjectionWorkerApplication`

Enables:
- `projection-consumer-enabled: true`

## Local Development Architecture
### Without Docker
Works:
- JS tests.
- Backend unit/controller/service tests listed in `backend:test`.
- Backend package build.
- Zepp build.

Does not work:
- LocalStack integration tests.
- Full `backend:verify`.

### With Docker
Expected:
- Testcontainers starts LocalStack.
- Integration tests create DynamoDB/SQS/S3 resources.
- Full `backend:verify` should run.

Current blocker:
- Docker Engine unavailable to active Codex user in the previous session.

## Deployment Architecture Target
Current Terraform baseline is not enough to deploy runtime services. Target state:
- API container image in ECR.
- Worker container image in ECR.
- API deployed to ECS Fargate or App Runner.
- Worker deployed separately with same image and `worker` profile.
- DynamoDB/SQS/S3 provisioned by Terraform.
- Secrets/config in Parameter Store or Secrets Manager.
- CloudWatch logs/metrics/alarms.
- GitHub Actions builds image, pushes to ECR, runs Terraform plan/apply through gated environments.

## Important Design Constraints
- Client-reported score is not trusted.
- Backend can only shape-validate, rate-limit, detect anomalies, quarantine and audit.
- `score_submissions` is source of truth for recovery.
- `leaderboard_entries` is rebuildable projection.
- Rebuild must hold lock and clear projection state safely.
- Projection worker must be idempotent because SQS can redeliver messages.
- Admin endpoints are currently unauthenticated in local code and need production auth before exposure.
