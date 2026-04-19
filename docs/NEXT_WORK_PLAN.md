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
Status: zamknięte.

Problem:
- `cmd /c npm run backend:verify` nie przechodzi w obecnym Codex środowisku, bo Docker nie jest dostępny dla aktywnego użytkownika.

Cel:
- Pełny Maven verify z LocalStack/Testcontainers ma przejść.

Pliki startowe:
- `backend/src/test/java/com/parallaxpilot/leaderboard/support/LocalStackIntegrationSupport.java`
- `backend/dev/localstack/init/01-bootstrap.sh`
- `package.json`
- `scripts/backend-maven.mjs`

Wdrożone:
1. `docker version` potwierdził działające środowisko Docker/Testcontainers.
2. `LeaderboardIntegrationTest` został utwardzony na bieżącą datę/scopes.
3. `ProjectionConcurrencyIntegrationTest` został naprawiony z deadlocka startowego.
4. `LocalStackIntegrationSupport` czyści context po każdej klasie, żeby nie reuse'ować klientów AWS ze starym endpointem kontenera.
5. `cmd /c npm run backend:verify` przechodzi.

Akceptacja:
- `backend:verify` przechodzi.
- Nie wyłączono ani nie pominięto testów integracyjnych, żeby ukryć problem.

## P1: Runtime Verification Of Watch Submit
Status: kod i harness coverage są mocne, nadal brak potwierdzenia runtime.

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

Stan pomocniczy:
- `tests/phone-services.test.js`, `tests/leaderboard-device-bridge.test.js` i `tests/app-bootstrap.test.js` pokrywają już Node-harness ścieżki settings/side-service/bridge/bootstrap.
- Następny sensowny krok to runtime/simulator proof, nie kolejny duży refactor harnessu.

## P2: Production Deployment Shape
Status: częściowo zrobione, z nowym postępem w CI image publish, rollout i state/secrets wiring.

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

Wdrożone:
1. Dodane IAM roles/policies dla API i worker.
2. Dodany ECS Fargate runtime shape dla API.
3. Dodany osobny worker service/task z profilem `worker`.
4. Dodany `backend/Dockerfile` jako image target.
5. Dodane outputy i README dla runtime planu.
6. Dodane env/secrets wiring dla ECS task definitions.
7. Dodane ECS autoscaling targets/policies dla API i worker.
8. Dodane `infra/terraform/environments/*.tfvars.example` jako wzorce env split.
9. Workflow backend potrafi publikować obrazy do ECR na `main`.
10. Workflow backend potrafi wykonać manualny `terraform plan` przez `workflow_dispatch`.
11. Dodany bootstrap stack dla remote state bucket + DynamoDB locking.
12. Dodane managed SSM Parameter Store i Secrets Manager resources dla API i worker.
13. Workflow backend potrafi zrobić rollout ECS task definition revisions po pushu nowych SHA-tagged obrazów.

Pozostało:
1. Dodać zatwierdzany `terraform apply` z environment protection i rollback discipline.
2. Zweryfikować realny `terraform plan` / `apply` po zainstalowaniu `terraform` lokalnie lub w docelowym CI.
3. Dodać environment modules zamiast jedynie przykładowych `tfvars`.
4. Dodać dashboard/alarms i readiness checks do produkcyjnego wdrożenia.
5. Dodać lepszą walidację i obserwowalność samego deploy rolloutu ECS.

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
1. Dodać readiness health indicators dla DynamoDB/SQS/S3.
2. Dodać CloudWatch dashboard.
3. Dodać alarms: queue age, projection failures, high quarantine ratio, API 5xx.
4. Ustalić produkcyjne progi alertów i ownership.

Akceptacja:
- Actuator pokazuje nowe metryki.
- Terraform tworzy dashboard i alarmy.
- Logi mają pola wystarczające do debugowania `submissionId` i `playerId`.

Najbliższy sensowny krok po obecnym utwardzeniu backendu:
1. Dodać readiness health indicators dla DynamoDB/SQS/S3.
2. Zbudować CloudWatch dashboard i alarmy na istniejących metrykach.
3. Ustalić operacyjne progi dla queue age, projection failures i API 5xx.

Status po follow-up hardening:
1. `X-Request-Id` i bazowe latency metrics są już dodane.
2. Jest licznik `leaderboard.admin.auth.failures`.
3. Queue depth / inflight / delayed / oldest age są już wystawione przez osobny binder SQS z cache refresh.
4. Dashboardy, alarmy i readiness checks nadal są odłożone.

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

Stan po ostatniej zmianie:
1. Tie-break `score -> survivedMs -> earlier playedAt -> playerId` jest już wyrównany między service i projection path.
2. Submitted-round classification zastępuje koncepcyjnie istniejący best-score tego samego gracza zamiast liczyć go drugi raz.
3. Nadal brakuje ścieżki prawdziwie global-scale rank estimation poza bounded scan MVP.

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
Status: zamknięte dla anonymous onboarding MVP.

Problem:
- App używa `demo-player` i `Pilot`.

Cel:
- Użytkownik ma stabilną anonymous identity bez pełnego loginu.

Pliki startowe:
- `zepp-app/setting/index.js`
- `zepp-app/app-side/index.js`
- `zepp-app/shared/leaderboard-config.js`
- `zepp-app/shared/leaderboard-submit.js`

Wdrożone:
1. Dodane install/player id generation w shared helperze.
2. Identity jest utrzymywana po stronie phone i synchronizowana na watch.
3. Dodana migration z demo defaults.
4. Dodany UI w Settings App: alias, player ID, hint i `New alias`.
5. Dodane testy helperów i screenshot coverage dla phone leaderboard.
6. Dodane Node harness testy dla `AppSettingsPage`, `AppSideService`, `leaderboard-device-bridge.js` i `app.js`.

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
