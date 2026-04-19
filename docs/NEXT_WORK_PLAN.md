# Next Work Plan

Audience: AI agents only. Human-facing documentation belongs only in `README.md` files.

Ten plik opisuje, co jeszcze warto zrobić, z priorytetami, plikami i kryteriami akceptacji.

## P1: Backend-only Versioning
Status: zamknięte.

Problem:
- `cmd /c npm run build` podbija wersję aplikacji Zepp nawet przy pracach backendowych.
- To powoduje churn w `package.json`, `package-lock.json` i `zepp-app/app.json`.

Cel:
- Backend-only prace mają mieć osobny build/release path bez bumpowania watch app version.

Pliki startowe:
- `package.json`
- `scripts/version-proxy.mjs`
- `scripts/zeus-proxy.mjs`
- `scripts/backend-maven.mjs`
- `docs/ZEPP_STORE_RELEASE_CHECKLIST.md`

Proponowane kroki:
1. Ustalić, czy `build` musi zawsze bumpować Zepp app.
2. Dodać backend-only release metadata albo dokumentowany backend package version path.
3. Dodać scripts, np. `build:app` dla Zepp i `build:backend` dla backendu.
4. Udokumentować, że backend-only PR nie powinien dotykać `zepp-app/app.json`.
5. Dodać test lub guard, jeśli repo ma hooki/release scripts.

Wdrożone:
1. `cmd /c npm run build` jest neutralnym buildem walidacyjnym bez bumpa wersji.
2. `cmd /c npm run build:app` jest jawną ścieżką release build dla Zepp app z bumpem wersji.
3. Dokumentacja operacyjna wskazuje, kiedy używać `build` vs `build:app`.

Akceptacja:
- Backend-only validation nie zmienia wersji aplikacji Zepp.
- Dokumentacja jasno mówi, kiedy wolno uruchomić Zepp build z bumpem wersji.

## P1: Docker/Testcontainers Full Verify
Problem:
- `cmd /c npm run backend:verify` nie przechodzi w obecnym Codex środowisku, bo Docker nie jest dostępny dla aktywnego użytkownika.

Cel:
- Pełny Maven verify z LocalStack/Testcontainers ma przejść.

Pliki startowe:
- `backend/src/test/java/com/parallaxpilot/leaderboard/support/LocalStackIntegrationSupport.java`
- `backend/dev/localstack/init/01-bootstrap.sh`
- `package.json`
- `scripts/backend-maven.mjs`

Znany stan:
- Docker Desktop został zainstalowany.
- `com.docker.service` nie startował z aktualnego procesu.
- Aktywny user Codex: `PC\codexsandboxonline`.
- `docker-users` zawierał `PC\krzys`, nie Codex user.
- Użytkownik kazał na razie pominąć Docker.

Proponowane kroki, gdy użytkownik wróci do tematu:
1. Uruchomić Docker Desktop jako właściwy user.
2. Zapewnić dostęp aktywnego procesu do Docker pipe.
3. Sprawdzić `docker version`.
4. Uruchomić `cmd /c npm run backend:verify`.
5. Naprawić realne błędy integracyjne, jeśli się pojawią.

Akceptacja:
- `backend:verify` przechodzi.
- Nie wyłączono ani nie pominięto testów integracyjnych, żeby ukryć problem.

## P1: Runtime Verification Of Watch Submit
Problem:
- Kod BLE/messaging i offline queue buduje się, ale nie był potwierdzony runtime na zegarku/symulatorze.

Cel:
- Potwierdzić end-to-end watch -> Side Service -> backend submit.

Pliki startowe:
- `zepp-app/app.js`
- `zepp-app/shared/leaderboard-device-bridge.js`
- `zepp-app/shared/leaderboard-submit.js`
- `zepp-app/app-side/index.js`
- `zepp-app/page/game/index.js`

Proponowane kroki:
1. Uruchomić app w Zepp/Zeus środowisku z Side Service.
2. Zakończyć run.
3. Zweryfikować, że submission trafia do Side Service queue.
4. Zweryfikować, że backend dostał `POST /v1/scores:submit`.
5. Zweryfikować ACK i usunięcie pozycji z watch queue.
6. Sprawdzić zachowanie offline: brak sieci, kolejka zostaje, po powrocie sieci flush.

Akceptacja:
- Submit działa po stronie runtime, nie tylko w buildzie.
- Offline queue nie gubi wyniku.
- Refresh leaderboardu po submit pokazuje nowy best/rank.

## P2: Production Deployment Shape
Problem:
- Terraform tworzy baseline resources, ale nie wdraża API/worker runtime.

Cel:
- Terraform i CI/CD mają stworzyć kompletną ścieżkę deploymentu backend API i worker.

Pliki startowe:
- `infra/terraform/main.tf`
- `infra/terraform/variables.tf`
- `infra/terraform/outputs.tf`
- `.github/workflows/backend.yml`
- `backend/pom.xml`

Proponowane kroki:
1. Dodać IAM roles/policies dla API i worker.
2. Dodać ECS Fargate albo App Runner service dla API.
3. Dodać osobny worker service/task z profilem `worker`.
4. Dodać Parameter Store/Secrets Manager config.
5. Dodać image build/push w GitHub Actions.
6. Dodać Terraform plan/apply z approval gates.
7. Dodać env split: local/staging/prod.

Akceptacja:
- CI publikuje obrazy.
- Terraform plan pokazuje API i worker runtime.
- Worker używa osobnej konfiguracji i nie miesza się z API.

## P2: Observability Production Layer
Problem:
- Są podstawowe logi i counters, ale brakuje operacyjnej widoczności.

Cel:
- Da się wykryć submit failures, duplicate spikes, projection lag i queue backlog.

Pliki startowe:
- `LeaderboardService.java`
- `ProjectionService.java`
- `SnapshotService.java`
- `application.yml`
- `infra/terraform/main.tf`

Proponowane kroki:
1. Dodać timers dla submit/read/projection.
2. Dodać metric dla SQS queue depth i age/lag.
3. Dodać correlation ID filter.
4. Dodać readiness health indicators dla DynamoDB/SQS/S3.
5. Dodać CloudWatch dashboard.
6. Dodać alarms: queue age, projection failures, high quarantine ratio, API 5xx.

Akceptacja:
- Actuator pokazuje nowe metryki.
- Terraform tworzy dashboard i alarmy.
- Logi mają pola wystarczające do debugowania `submissionId` i `playerId`.

## P2: Ranking Stability
Problem:
- Tie-break jest w kodzie, ale brak wystarczającej dokumentacji i testów dla edge cases.

Cel:
- Ranking jest deterministyczny i testowany dla remisów.

Pliki startowe:
- `LeaderboardService.java`
- `BestScoreRepository.java`
- `ProjectionService.java`
- `LeaderboardIntegrationTest.java`
- `ProjectionDedupeIntegrationTest.java`

Proponowane kroki:
1. Dopisać testy dla equal score, equal survivedMs, different playedAt.
2. Dopisać testy dla equal score/time i playerId fallback.
3. Sprawdzić global/daily/seasonal consistency.
4. Dopisać opis tie-break w architekturze.

Akceptacja:
- Testy potwierdzają deterministyczną kolejność.
- Projection rebuild daje ten sam ranking co live path.

## P2: Anti-abuse Hardening
Problem:
- Obecny anti-abuse jest celowo bazowy.

Cel:
- Dodać więcej sygnałów bez udawania pełnego anti-cheat.

Pliki startowe:
- `AntiAbuseService.java`
- `RiskSignalRepository.java`
- `RateLimitRepository.java`
- `SubmitScoreRequest.java`
- `AdminSubmissionDebugResponse.java`

Proponowane kroki:
1. Dodać device/client version anomaly rules.
2. Dodać per-device lub install-id throttling po wprowadzeniu identity.
3. Dodać replay pattern detection.
4. Dodać risk severity policy.
5. Dodać admin endpoint do risk review/quarantine release.

Akceptacja:
- Suspicious submissions mają czytelne risk signals.
- Quarantine path jest testowany.
- Debug endpoint pomaga wyjaśnić decyzję.

## P2: Snapshot Restore And Drift Tools
Problem:
- Snapshot export istnieje, ale operacyjnie nie wystarczy.

Cel:
- Snapshoty mogą służyć do recovery i porównywania driftu projection.

Pliki startowe:
- `SnapshotService.java`
- `DynamoDbJsonRepository.java`
- `LeaderboardService.java`
- `LeaderboardController.java`

Proponowane kroki:
1. Dodać list snapshots endpoint.
2. Dodać drift compare: snapshot vs current tables.
3. Dodać restore dry-run.
4. Dopiero potem rozważyć restore write path.

Akceptacja:
- Można porównać snapshot z aktualnym stanem.
- Restore nie jest destrukcyjne bez jawnego trybu.

## P3: Player Identity Onboarding
Problem:
- App używa `demo-player` i `Pilot`.

Cel:
- Użytkownik ma stabilną anonymous identity bez pełnego loginu.

Pliki startowe:
- `zepp-app/setting/index.js`
- `zepp-app/app-side/index.js`
- `zepp-app/shared/leaderboard-config.js`
- `zepp-app/shared/leaderboard-submit.js`

Proponowane kroki:
1. Dodać install/player id generation.
2. Dodać nickname setup.
3. Zdecydować, gdzie identity jest zapisywana: watch local storage, settingsStorage, albo oba.
4. Dodać migration z demo defaults.
5. Dodać UI w Settings App.

Akceptacja:
- Nowy user nie submituje jako `demo-player`.
- Reinstall/device replacement behavior jest opisany.
- Jeśli dodasz nowy UI, dodaj screenshot tests.

## P3: Admin UI
Problem:
- Jest backend debug API, ale nie ma widoku.

Cel:
- Operator może podejrzeć submission/risk/rank divergence bez curl.

Pliki startowe:
- Do ustalenia: repo nie ma jeszcze web admin app.
- Backend endpoint: `GET /v1/admin/submissions/{submissionId}/debug`

Proponowane kroki:
1. Najpierw ustalić, gdzie ma mieszkać admin UI.
2. Jeśli jako nowy screen/page w istniejącym stacku, dodać Playwright screenshot scenario.
3. Nie wystawiać admin UI publicznie bez auth.

Akceptacja:
- Widok ma test screenshotowy.
- Auth/admin access jest uwzględniony przed produkcyjnym wdrożeniem.
