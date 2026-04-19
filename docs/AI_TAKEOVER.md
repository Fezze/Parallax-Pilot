# AI Takeover Guide

Ten plik jest punktem startowym dla kolejnego agenta AI. Cel: przejąć pracę bez przeszukiwania całego repozytorium.

## Najpierw Przeczytaj
1. `docs/AI_IMPLEMENTATION_STATUS.md` - co faktycznie jest zrobione.
2. `docs/AI_ARCHITECTURE.md` - jak działa system i gdzie jest kod.
3. `docs/AI_NEXT_WORK_PLAN.md` - co zostało i w jakiej kolejności robić.
4. `docs/AI_VALIDATION_RUNBOOK.md` - jak walidować zmiany.
5. `docs/BACKEND_HANDOFF.md` - krótki historyczny handoff z ostatniej sesji.

## Aktualny Stan Repo
- Ostatni commit dokumentacyjny: `487ea0f Document backend handoff`.
- Ostatni commit funkcjonalny: `5e9e03a Add backend ops and score submit flow`.
- Repo było czyste po commicie `487ea0f`.
- Backend ma Maven Wrapper w `backend/`.
- Backendowe skrypty npm używają `scripts/backend-maven.mjs`.
- Pełne `backend:verify` wymaga Docker/Testcontainers; Docker został pominięty na życzenie użytkownika.

## Najważniejsze Zasady Projektu
- Po zmianie kodu uruchom build jako walidację zamykającą.
- Po każdym udanym buildzie zrób commit przed kontynuowaniem.
- Nowy ekran lub nowa strona musi dostać scenariusz screenshotowy Playwright.
- Walidacja UI oznacza obejrzenie wygenerowanych screenshotów, nie tylko zielone testy.
- Nie cofaj cudzych zmian w working tree.
- Backend-only prace powinny docelowo nie podbijać wersji aplikacji Zepp, ale to nadal jest brak do zrobienia.

## Szybkie Komendy
- Testy JS bez screenshotów: `cmd /c npm test`
- Backend testy bez Dockera: `cmd /c npm run backend:test`
- Backend build bez testów: `cmd /c npm run build:backend`
- Zepp build: `cmd /c npm run build`
- Pełny backend verify z LocalStack/Testcontainers: `cmd /c npm run backend:verify`

## Ważne Ostrzeżenie O Buildzie Zepp
`cmd /c npm run build` podbija wersję aplikacji w `package.json`, `package-lock.json` i `zepp-app/app.json`.

Jeśli robisz tylko backend, preferuj:
- `cmd /c npm run backend:test`
- `cmd /c npm run build:backend`

Backend-only versioning jest nadal zadaniem P1.

## Główne Obszary Kodu
- Backend API: `backend/src/main/java/com/parallaxpilot/leaderboard/api/LeaderboardController.java`
- Submit/rebuild/ranking service: `backend/src/main/java/com/parallaxpilot/leaderboard/service/LeaderboardService.java`
- Projection worker entrypoint: `backend/src/main/java/com/parallaxpilot/leaderboard/ProjectionWorkerApplication.java`
- Projection scheduler gate: `backend/src/main/java/com/parallaxpilot/leaderboard/service/ProjectionQueueConsumer.java`
- Snapshot export: `backend/src/main/java/com/parallaxpilot/leaderboard/service/SnapshotService.java`
- Zepp watch submit bridge: `zepp-app/shared/leaderboard-device-bridge.js`
- Zepp submit contract/queue helpers: `zepp-app/shared/leaderboard-submit.js`
- Zepp Side Service: `zepp-app/app-side/index.js`
- Terraform baseline: `infra/terraform/`
- Backend CI: `.github/workflows/backend.yml`

## Czego Nie Zakładać
- Nie zakładaj, że pełne testy integracyjne przeszły lokalnie. Nie przeszły, bo Docker nie był dostępny.
- Nie zakładaj, że BLE submit został potwierdzony na fizycznym zegarku. Build przeszedł, ale wymaga testu runtime.
- Nie zakładaj, że Terraform wdraża działające API/worker services. Obecnie tworzy tylko baseline resources.
- Nie zakładaj, że admin/debug ma UI. Jest tylko backend API.
