# Backend Roadmap

## Current status
Addressed:
- Spring Boot API scaffold
- basic submit and leaderboard endpoints
- LocalStack bootstrap for DynamoDB, SQS, and S3
- basic `global/daily/seasonal` scope model
- Zepp `Side Service` and `Settings App`
- screenshot coverage for the phone leaderboard screen

Missing or partial:
- no real async pipeline on SQS
- no durable replay/rebuild from the event log
- no dedicated idempotency table and no safe conditional writes
- no rate limiting or anti-abuse
- no production-grade observability
- no backend integration tests with LocalStack
- no seasonal cutover or reset jobs
- no real watch -> phone submit contract
- no CI/CD or deployment setup

## Roadmap
### Phase 1: Correctness baseline
- Split the write path into `submission log -> best score update -> leaderboard projection`.
- Replace current plain DynamoDB writes with conditional writes to avoid race conditions on concurrent submits.
- Add a dedicated idempotency record keyed by `submissionId` with TTL and safe retry behavior.
- Replace the generic JSON repository shape with explicit source-of-truth and projection records.
- Add request validation for score, time, and device metadata plus a consistent error model.

### Phase 2: Async leaderboard processing
- Move leaderboard projection updates out of the request path into an SQS consumer.
- Keep append-only `score_submissions` as the only replay input.
- Add projection workers for `best_scores` and `leaderboard_entries`.
- Add a replay job that rebuilds projections from the submission log.
- Add S3 snapshot export for recovery and leaderboard drift debugging.

### Phase 3: Ranking quality
- Implement exact rank only for the supported range and approximate banding outside it.
- Add an `around-me` leaderboard window for the phone UI.
- Finalize tie-break rules and stable rank behavior for ties.
- Add season metadata and explicit cutover rules for `seasonal`.
- Add safe daily and seasonal reset flow with atomic active-scope switching.

### Phase 4: Abuse resistance
- Add request throttling per player, device, and IP.
- Add suspicious submission rules for outlier scores, impossible frequency, replay patterns, and version anomalies.
- Add quarantine/flag flow instead of hard reject for some suspicious results.
- Persist risk signals and suspicious reasons next to submissions.
- Add admin/debug tooling for submission inspection and rank divergence checks.

### Phase 5: Operability
- Add structured logging with `submissionId`, `playerId`, `scope`, and `correlationId`.
- Add Micrometer metrics for submit latency, duplicate ratio, projection lag, and leaderboard read latency.
- Add health/readiness checks and LocalStack smoke checks.
- Add dashboards and alerts for queue backlog, projection failures, and suspicious traffic spikes.
- Add LocalStack integration tests and concurrency tests for parallel submissions.

### Phase 6: Delivery
- Add CI for backend tests, frontend tests, and screenshot validation.
- Add backend build/deploy pipeline for `local`, `staging`, and `prod`.
- Add backend-only versioning independent of the watch app.
- Add a release checklist for backend and companion phone-side changes.
