# Implementation Status

Audience: AI agents only. Human-facing documentation belongs only in `README.md` files.

Ten plik opisuje, co jest zrobione, gdzie leży kod i jaki jest poziom pewności.

## Stan Globalny
- Watch game istnieje i buduje się przez Zeus.
- Phone `Settings App` pokazuje leaderboard z cache w `settingsStorage`.
- Phone `Side Service` robi online sync z backendem.
- Backend Spring Boot jest w `backend/`.
- AWS-emulacja lokalna jest opisana przez LocalStack/Testcontainers.
- Terraform i GitHub Actions są baseline, nie pełny deployment.
- Build walidacyjny Zepp jest oddzielony od release bumpa wersji.

## Zrobione: Backend-only Versioning
Status: zaimplementowane.

Pliki:
- `package.json`
- `scripts/zeus-proxy.mjs`
- `scripts/version-proxy.mjs`
- `docs/TAKEOVER.md`
- `docs/VALIDATION_RUNBOOK.md`
- `docs/NEXT_WORK_PLAN.md`

Zachowanie:
- `cmd /c npm run build` wykonuje neutralny build Zepp bez zmiany wersji.
- `cmd /c npm run build:app` wykonuje build Zepp z bumpem `package.json`, `package-lock.json` i `zepp-app/app.json`.
- Backend-only walidacja nie wymusza już dotykania wersji watch app.

Ryzyko:
- Ścieżka `build:app` wymaga walidacji runtime/store przy następnym release aplikacji.

## Zrobione: Watch -> Side Service Submit
Status: zaimplementowane, wymaga runtime testu na Zepp/symulatorze.

Pliki:
- `zepp-app/app.js`
- `zepp-app/page/game/index.js`
- `zepp-app/shared/leaderboard-device-bridge.js`
- `zepp-app/shared/leaderboard-submit.js`
- `zepp-app/shared/storage.js`
- `zepp-app/app-side/index.js`

Zachowanie:
- Po zakończeniu runu `page/game/index.js` zapisuje wynik lokalnie i buduje submission.
- Submission trafia do lokalnej kolejki watch.
- `leaderboard-device-bridge.js` próbuje wysłać kolejkę przez BLE/messaging.
- `app-side/index.js` odbiera submission, zapisuje go w phone-side queue i próbuje POST do backendu.
- Po sukcesie Side Service wysyła ACK, a watch usuwa submission z lokalnej kolejki.
- Side Service odświeża leaderboard po submit/refresh.

Testy:
- `tests/shared-helpers.test.js` sprawdza helpery kolejki i serializację wiadomości.
- `cmd /c npm test` przeszedł po zmianach.

Ryzyko:
- Brak fizycznej walidacji BLE/messaging.
- Brak retry backoff, TTL i widocznego statusu submitu dla użytkownika.

## Zrobione: Backend API
Status: zaimplementowane.

Pliki:
- `backend/src/main/java/com/parallaxpilot/leaderboard/api/LeaderboardController.java`
- `backend/src/main/java/com/parallaxpilot/leaderboard/service/LeaderboardService.java`
- `backend/src/main/java/com/parallaxpilot/leaderboard/api/dto/*`

Endpointy:
- `POST /v1/scores:submit`
- `GET /v1/leaderboards/{scope}`
- `GET /v1/leaderboards/{scope}/around-me?playerId=...`
- `GET /v1/players/{playerId}/best`
- `GET /v1/rankings/classify?playerId=...`
- `POST /v1/admin/projections:drain`
- `POST /v1/admin/projections:rebuild`
- `GET /v1/admin/seasons/active`
- `PATCH /v1/admin/seasons:cutover`
- `POST /v1/admin/snapshots:export`
- `GET /v1/admin/submissions/{submissionId}/debug`

Testy:
- `LeaderboardControllerTest` pokrywa podstawowe kontrakty kontrolera.
- `LeaderboardIntegrationTest` istnieje, ale wymaga Docker/Testcontainers.

## Zrobione: Idempotency I Best Scores
Status: zaimplementowane.

Pliki:
- `backend/src/main/java/com/parallaxpilot/leaderboard/repository/IdempotencyRepository.java`
- `backend/src/main/java/com/parallaxpilot/leaderboard/repository/BestScoreRepository.java`
- `backend/src/main/java/com/parallaxpilot/leaderboard/service/LeaderboardService.java`

Zachowanie:
- Submit używa idempotency keyed by `submissionId`.
- Duplicate submit zwraca accepted duplicate path bez ponownego update.
- `best_scores` używa conditional write: wyższy score wygrywa; przy remisie dłuższy survival; przy remisie wcześniejszy `playedAt`.
- Idempotency jest finalizowane po udanym flow lub quarantine path.

Ryzyko:
- Wymaga pełnego `backend:verify` z Dockerem dla integracyjnego potwierdzenia po ostatnich zmianach.

## Zrobione: Projection Pipeline
Status: zaimplementowane.

Pliki:
- `backend/src/main/java/com/parallaxpilot/leaderboard/service/ProjectionService.java`
- `backend/src/main/java/com/parallaxpilot/leaderboard/service/ProjectionQueueConsumer.java`
- `backend/src/main/java/com/parallaxpilot/leaderboard/ProjectionWorkerApplication.java`
- `backend/src/main/java/com/parallaxpilot/leaderboard/repository/ProjectionQueueRepository.java`
- `backend/src/main/java/com/parallaxpilot/leaderboard/repository/ProjectionProcessedRepository.java`
- `backend/src/main/java/com/parallaxpilot/leaderboard/repository/ProjectionIndexRepository.java`

Zachowanie:
- API publikuje projection tasks do SQS po best-score update.
- Projection processing sprawdza current best, usuwa stare projection entry i wpisuje nowe.
- Dedupe key to `submissionId#scope#scopeKey`, więc jeden submission może poprawnie zaktualizować global/daily/seasonal.
- Default API profile ma `projection-consumer-enabled: false`.
- Worker profile ma `projection-consumer-enabled: true`.

Testy:
- `ProjectionDedupeIntegrationTest` i `ProjectionConcurrencyIntegrationTest` istnieją, ale wymagają Docker/Testcontainers.

## Zrobione: Seasons
Status: zaimplementowane.

Pliki:
- `backend/src/main/java/com/parallaxpilot/leaderboard/service/SeasonService.java`
- `backend/src/main/java/com/parallaxpilot/leaderboard/repository/SeasonMetadataRepository.java`
- `backend/src/test/java/com/parallaxpilot/leaderboard/service/SeasonServiceTest.java`

Zachowanie:
- Manual cutover endpoint.
- Scheduled UTC rollover istnieje.
- Custom/manual season safeguard istnieje.

Testy:
- `SeasonServiceTest` przechodzi w `backend:test`.

## Zrobione: S3 Snapshots
Status: export zaimplementowany, restore/diff brak.

Pliki:
- `backend/src/main/java/com/parallaxpilot/leaderboard/service/SnapshotService.java`
- `backend/src/main/java/com/parallaxpilot/leaderboard/api/dto/AdminSnapshotResponse.java`
- `backend/src/test/java/com/parallaxpilot/leaderboard/service/SnapshotServiceTest.java`

Zachowanie:
- `POST /v1/admin/snapshots:export` zapisuje JSON snapshot do S3.
- Snapshot zawiera submissions, best scores, leaderboard entries i risk signals.

Braki:
- Brak restore.
- Brak drift comparison.
- Brak endpointu list/download snapshots.

## Zrobione: Admin Debug API
Status: backend API zaimplementowane, UI brak.

Pliki:
- `backend/src/main/java/com/parallaxpilot/leaderboard/api/dto/AdminSubmissionDebugResponse.java`
- `backend/src/main/java/com/parallaxpilot/leaderboard/repository/ScoreSubmissionRepository.java`
- `backend/src/main/java/com/parallaxpilot/leaderboard/repository/RiskSignalRepository.java`
- `backend/src/main/java/com/parallaxpilot/leaderboard/service/LeaderboardService.java`

Zachowanie:
- `GET /v1/admin/submissions/{submissionId}/debug` zwraca submission, risk signals, best scores i classification.

Braki:
- Brak admin UI.
- Brak endpointów risk review/quarantine release.

## Zrobione: Observability Baseline
Status: podstawy są, production observability nie.

Pliki:
- `backend/src/main/java/com/parallaxpilot/leaderboard/service/LeaderboardService.java`
- `backend/src/main/java/com/parallaxpilot/leaderboard/service/ProjectionService.java`
- `backend/src/main/java/com/parallaxpilot/leaderboard/service/SnapshotService.java`
- `backend/src/main/resources/application.yml`

Zachowanie:
- Actuator exposes `health`, `info`, `metrics`.
- Są podstawowe logi submit/projection.
- Są podstawowe Micrometer counters submit/projection/snapshot.

Braki:
- Timery latency.
- Queue depth/lag metrics.
- Correlation ID.
- CloudWatch dashboard/alarms.
- Readiness checks dla DynamoDB/SQS/S3.

## Zrobione: Terraform Baseline
Status: baseline resources, nie pełny deployment.

Pliki:
- `infra/terraform/versions.tf`
- `infra/terraform/variables.tf`
- `infra/terraform/main.tf`
- `infra/terraform/outputs.tf`
- `infra/terraform/README.md`

Zasoby:
- DynamoDB tables.
- SQS projection queue.
- S3 snapshot bucket z versioning/lifecycle.
- CloudWatch log groups.
- ECR repos dla API i worker.

Braki:
- Remote state i locking.
- IAM roles/policies.
- ECS/App Runner services.
- Task definitions.
- Secrets/Parameter Store.
- Autoscaling.
- Alarms/dashboard.
- Environment modules.

## Zrobione: CI Baseline
Status: verify workflow, brak deployment.

Pliki:
- `.github/workflows/backend.yml`

Zachowanie:
- Checkout.
- Node setup.
- Java setup.
- `npm ci`
- `npm test`
- `npm run build:backend`
- `npm run backend:verify`

Ryzyko:
- `backend:verify` wymaga Docker na runnerze.
- Brak image build/push.
- Brak Terraform plan/apply.
- Brak approval gates.

## Ostatnia Znana Walidacja
- `cmd /c npm test`: pass, 52 tests.
- `cmd /c npm run backend:test`: pass, 12 tests.
- `cmd /c npm run build`: pass, bez bumpa wersji watch app.
- `cmd /c npm run build:backend`: pass.
- `node scripts/zeus-proxy.mjs build --bump-version --dry-run`: pass, ścieżka release deklaruje bump `2.4.5 -> 2.4.6` bez modyfikacji plików.
- `cmd /c npm run backend:verify`: fail only at Docker/Testcontainers initialization in current Codex environment.
