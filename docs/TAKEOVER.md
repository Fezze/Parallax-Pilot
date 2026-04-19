# Takeover Guide

Audience: AI agents only. Human-facing documentation belongs only in `README.md` files.

Ten plik jest punktem startowym dla kolejnego agenta AI. Cel: przejąć pracę bez przeszukiwania całego repozytorium.

## Najpierw Przeczytaj
1. `docs/DOCUMENTATION_POLICY.md` - zasady dokumentacji: internal docs są dla AI, `README.md` dla ludzi.
2. `docs/IMPLEMENTATION_STATUS.md` - co faktycznie jest zrobione.
3. `docs/ARCHITECTURE.md` - jak działa system i gdzie jest kod.
4. `docs/NEXT_WORK_PLAN.md` - co zostało i w jakiej kolejności robić.
5. `docs/VALIDATION_RUNBOOK.md` - jak walidować zmiany.
6. `docs/BACKEND_HANDOFF.md` - krótki historyczny handoff z ostatniej sesji.

## Aktualny Stan Repo
- Ostatni commit dokumentacyjny przed reorganizacją: `9dff60d Add AI backend takeover docs`.
- Ostatni commit funkcjonalny przed bieżącą sesją: `a3f32d7 Split validation and release app builds`.
- Repo było czyste po commicie `9dff60d` przed tą reorganizacją dokumentacji.
- Backend ma Maven Wrapper w `backend/`.
- Backendowe skrypty npm używają `scripts/backend-maven.mjs`.
- Pełne `backend:verify` przechodzi lokalnie z Docker/Testcontainers.

## Najważniejsze Zasady Projektu
- Po zmianie kodu uruchom build jako walidację zamykającą.
- Po każdym udanym buildzie zrób commit przed kontynuowaniem.
- Nowy ekran lub nowa strona musi dostać scenariusz screenshotowy Playwright.
- Walidacja UI oznacza obejrzenie wygenerowanych screenshotów, nie tylko zielone testy.
- Nie cofaj cudzych zmian w working tree.
- Backend-only build nie podbija już wersji aplikacji Zepp.

## Szybkie Komendy
- Testy JS bez screenshotów: `cmd /c npm test`
- Backend testy bez Dockera: `cmd /c npm run backend:test`
- Backend build bez testów: `cmd /c npm run build:backend`
- Zepp build: `cmd /c npm run build`
- Zepp release build z bumpem wersji: `cmd /c npm run build:app`
- Pełny backend verify z LocalStack/Testcontainers: `cmd /c npm run backend:verify`

## Ważne Ostrzeżenie O Buildzie Zepp
`cmd /c npm run build` nie podbija już wersji aplikacji. To jest bezpieczny build walidacyjny.

`cmd /c npm run build:app` podbija wersję aplikacji w `package.json`, `package-lock.json` i `zepp-app/app.json`.

Jeśli robisz tylko backend, preferuj:
- `cmd /c npm run backend:test`
- `cmd /c npm run build:backend`

Jeśli robisz release watch app albo przygotowujesz store submission, użyj:
- `cmd /c npm run build:app`

## Główne Obszary Kodu
- Backend API: `backend/src/main/java/com/parallaxpilot/leaderboard/api/LeaderboardController.java`
- Submit/rebuild/ranking service: `backend/src/main/java/com/parallaxpilot/leaderboard/service/LeaderboardService.java`
- Projection worker entrypoint: `backend/src/main/java/com/parallaxpilot/leaderboard/ProjectionWorkerApplication.java`
- Projection scheduler gate: `backend/src/main/java/com/parallaxpilot/leaderboard/service/ProjectionQueueConsumer.java`
- Snapshot export: `backend/src/main/java/com/parallaxpilot/leaderboard/service/SnapshotService.java`
- Shared anonymous identity helper: `zepp-app/shared/leaderboard-identity.js`
- Zepp watch submit bridge: `zepp-app/shared/leaderboard-device-bridge.js`
- Zepp submit contract/queue helpers: `zepp-app/shared/leaderboard-submit.js`
- Zepp Side Service: `zepp-app/app-side/index.js`
- Zepp Settings App onboarding UI: `zepp-app/setting/index.js`
- Terraform baseline: `infra/terraform/`
- Backend CI: `.github/workflows/backend.yml`

## Czego Nie Zakładać
- Nie zakładaj, że BLE submit został potwierdzony na fizycznym zegarku. Build przeszedł, ale wymaga testu runtime.
- Nie zakładaj, że Terraform wdraża pełny production-ready stack. Jest już runtime shape ECS/ALB/IAM dla API i worker, ale bez pełnego CI/CD, secrets i env split.
- Nie zakładaj, że admin/debug ma UI. Jest tylko backend API.
