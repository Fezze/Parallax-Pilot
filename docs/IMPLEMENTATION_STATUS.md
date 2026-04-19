# Implementation Status

Audience: AI agents only. Human-facing documentation belongs only in `README.md` files.

Ten plik opisuje, co jest zrobione, gdzie leży kod i jaki jest poziom pewności.

## Stan Globalny
- Watch game istnieje i buduje się przez Zeus.
- Phone `Settings App` pokazuje leaderboard z cache w `settingsStorage`.
- Phone `Side Service` robi online sync z backendem.
- Backend Spring Boot jest w `backend/`.
- AWS-emulacja lokalna jest opisana przez LocalStack/Testcontainers.
- Terraform ma baseline resources plus wstępny runtime shape ECS/ALB/IAM dla API i projection worker.
- Build walidacyjny Zepp jest oddzielony od release bumpa wersji.
- Anonymous identity onboarding zastąpił `demo-player` / `Pilot`.
- Pełne `cmd /c npm run backend:verify` przechodzi lokalnie.
- JS harness obejmuje już root app bootstrap, phone settings, side service i watch BLE bridge.
- Backend Docker image path jest ustabilizowany pod CI przez `backend/Dockerfile` oczekujący `target/app.jar`.
- Main Terraform stack jest przygotowany pod remote state `s3` z lockingiem.

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
- `tests/phone-services.test.js` pokrywa `AppSettingsPage` i `AppSideService` w Node harnessie.
- `tests/leaderboard-device-bridge.test.js` pokrywa watch BLE bridge z fake BLE adapterem.
- `tests/app-bootstrap.test.js` pokrywa root `App` bootstrap i cleanup.
- `cmd /c npm test` przechodzi.

Pokrycie:
- `zepp-app/setting/index.js`: `96.06%` statements.
- `zepp-app/app-side/index.js`: `88.84%` statements.
- `zepp-app/shared/leaderboard-device-bridge.js`: `95.4%` statements.
- `zepp-app/app.js`: `100%` statements.

Ryzyko:
- Brak fizycznej walidacji BLE/messaging.
- Brak retry backoff, TTL i widocznego statusu submitu dla użytkownika.

## Zrobione: Player Identity Onboarding
Status: zaimplementowane.

Pliki:
- `zepp-app/shared/leaderboard-identity.js`
- `zepp-app/shared/leaderboard-submit.js`
- `zepp-app/shared/storage.js`
- `zepp-app/shared/leaderboard-device-bridge.js`
- `zepp-app/app-side/index.js`
- `zepp-app/setting/index.js`
- `tests/shared-helpers.test.js`
- `tests/playwright/preview/scenarios.js`

Zachowanie:
- Phone side generuje i utrzymuje stabilną anonymous identity `pilot-xxxxxxxx` / `Pilot XXXX`.
- Demo defaults są migrowane do nowej identity.
- Watch może poprosić phone o identity i dostać sync przez messaging.
- Settings App pokazuje alias, player ID i akcję `New alias` zamiast stałego `demo-player`.

Testy:
- `cmd /c npm test` przechodzi.
- `cmd /c npm run test:playwright:screens` przechodzi, a zaktualizowane screenshoty leaderboard phone zostały obejrzane.

Ryzyko:
- Nadal brak fizycznej walidacji na zegarku/symulatorze.
- Rotacja aliasu czyści cache gracza i wymusza odświeżenie, ale nie ma jeszcze pełnego onboarding flow z wyjaśnieniem reinstall/device-replacement.

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
- `LeaderboardIntegrationTest` przechodzi w `cmd /c npm run backend:verify` po utwardzeniu dat testowych.

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
- Dalsze zmiany w testach integracyjnych powinny uważać na bieżącą datę/scope oraz na Spring context cache przy LocalStack-backed klasach.

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
- `ProjectionDedupeIntegrationTest` i `ProjectionConcurrencyIntegrationTest` przechodzą w `cmd /c npm run backend:verify`.

Uwagi implementacyjne:
- `ProjectionConcurrencyIntegrationTest` miał deadlock przez `invokeAll()` wywołane przed zwolnieniem latcha startowego; test został naprawiony.
- `LocalStackIntegrationSupport` czyści Spring context po każdej klasie, żeby uniknąć reuse klientów AWS ze starym endpointem kontenera.

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

## Zrobione: Terraform Deployment Shape
Status: baseline resources plus runtime shape, env templates, managed secret scaffolding, remote state bootstrap i podstawowe CI rollout; nadal niepełny deployment produkcyjny.

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
- ECS cluster.
- IAM execution/task roles dla API i worker.
- ALB, target group i listener dla API.
- ECS task definitions/services dla API i projection worker.
- ECS autoscaling targets/policies dla API i projection worker.
- Optional runtime environment variable maps dla API i worker.
- Optional ECS secret references (`valueFrom`) dla API i worker.
- Managed `aws_ssm_parameter` i `aws_secretsmanager_secret` / `secret_version` dla API i worker.
- `backend/Dockerfile` jako runtime image target.
- `infra/terraform/environments/dev.tfvars.example`
- `infra/terraform/environments/staging.tfvars.example`
- `infra/terraform/environments/prod.tfvars.example`
- `infra/terraform/backend.tf` z backendem `s3`.
- `infra/terraform/bootstrap-state/*` dla bucketu state i lock table.

Braki:
- Alarms/dashboard.
- Environment modules.

CI/CD:
- `.github/workflows/backend.yml` nadal robi verify.
- Na `main` może teraz także buildować i pushować obraz do dwóch repozytoriów ECR przez OIDC, jeśli ustawione są repo vars.
- `workflow_dispatch` pozwala uruchomić manualny `terraform fmt -check`, `init` i `plan` z parametrami runtime.
- Na `main` może także zarejestrować nowe ECS task definition revisions i wykonać rollout obu serwisów po pushu SHA-tagged obrazów.
- Nadal brak zautomatyzowanego `terraform apply`, approval gates i environment protection.

Walidacja:
- `cmd /c npm run build:backend` przechodzi.
- `cmd /c npm run build` przechodzi.
- `docker build -f backend/Dockerfile backend` przechodzi lokalnie po przygotowaniu `backend/target/app.jar`.
- `terraform fmt -check` nie został uruchomiony lokalnie, bo CLI `terraform` nie jest zainstalowany.

## Zrobione: CI Baseline
Status: verify workflow plus image publish/manual plan/ECS rollout, brak pełnego deployment pipeline.

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
- Optional image build/push do ECR na `main` przy skonfigurowanych vars.
- Optional manual `terraform plan` przez `workflow_dispatch`.
- Optional ECS deploy rollout po opublikowaniu obrazu na `main`.

Ryzyko:
- `backend:verify` wymaga Docker na runnerze.
- Nadal brak `terraform apply` i approval gates.
- Workflow zależy od repo vars typu `AWS_DEPLOY_ROLE_ARN`, `AWS_API_ECR_REPOSITORY`, `AWS_PROJECTION_WORKER_ECR_REPOSITORY`, `AWS_TF_STATE_BUCKET`, `AWS_TF_LOCK_TABLE`, `AWS_ECS_CLUSTER_NAME`, `AWS_API_SERVICE_NAME`, `AWS_PROJECTION_WORKER_SERVICE_NAME`.

## Ostatnia Znana Walidacja
- `cmd /c npm test`: pass, 66 tests.
- `npx c8 --all --src zepp-app --exclude tests/** --reporter=text node --import ./tests/register-zepp-globals.mjs --test`: pass, `86.4%` statements / `82.09%` branches / `85.04%` functions dla `zepp-app`.
- `cmd /c npm run build`: pass, bez bumpa wersji watch app.
- `cmd /c npm run build:backend`: pass.
- `docker build -f backend/Dockerfile backend`: pass po skopiowaniu zbudowanego jar do `backend/target/app.jar`.
- `cmd /c npm run backend:test`: pass, 12 tests.
- `cmd /c npm run backend:verify`: pass, Docker/Testcontainers aktywne.
