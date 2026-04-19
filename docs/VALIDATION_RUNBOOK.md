# Validation Runbook

Audience: AI agents only. Human-facing documentation belongs only in `README.md` files.

Ten plik mówi, co uruchamiać po zmianach i jak interpretować wyniki.

## Zasady Zamknięcia Pracy
- Po zmianie kodu uruchom odpowiedni build.
- Po każdym udanym buildzie zrób commit przed kontynuowaniem.
- Przy zmianach UI dodaj i obejrzyj screenshoty Playwright.
- Przy zmianach backendu nie udawaj, że Docker/Testcontainers przeszły, jeśli ich nie uruchomiono.

## Minimalna Walidacja Bez Dockera
Użyj, gdy Docker jest niedostępny albo użytkownik kazał go pominąć.

```powershell
cmd /c npm test
cmd /c npm run backend:test
cmd /c npm run build:backend
```

Co to pokrywa:
- JS/shared helpers/game logic.
- Wybrane backend unit/controller/service tests bez LocalStack.
- Kompilację i packaging backendu.

Czego nie pokrywa:
- LocalStack integration tests.
- SQS/DynamoDB/S3 real behavior.
- Projection concurrency with Testcontainers.

## Zepp Build
```powershell
cmd /c npm run build
```

Uwaga:
- Ten build nie podbija wersji watch app.
- Po sukcesie zgodnie z regułami repo trzeba zrobić commit.

Jeśli potrzebny jest release build z bumpem wersji aplikacji:

```powershell
cmd /c npm run build:app
```

Ten wariant podbija wersję w `package.json`, `package-lock.json` i `zepp-app/app.json`.

## Pełna Backend Walidacja Z Dockerem
```powershell
cmd /c npm run backend:verify
```

Wymaga:
- Docker Engine dostępny dla aktywnego usera.
- Testcontainers może utworzyć LocalStack container.

Oczekiwane:
- Unit/controller/service tests.
- Integration tests z DynamoDB/SQS/S3.
- Coverage report przez Jacoco.

Jeśli fail jest na Docker init:
- To nie jest błąd backendu.
- Nie oznaczaj full verify jako zaliczone.
- Napraw Docker access albo poproś użytkownika o pozwolenie na konfigurację środowiska.

## Playwright Screenshot Validation
Uruchamiaj przy zmianach UI/screen/page.

```powershell
cmd /c npm run test:playwright:screens
```

Po uruchomieniu:
- Obejrzyj wygenerowane screenshoty.
- Sprawdź matrix locale/shape/resolution używany przez repo.
- Nie kończ na samym zielonym wyniku testów.

## Backend-only Workflow
Najbezpieczniejszy flow dla backendu bez Dockera:

```powershell
cmd /c npm run backend:test
cmd /c npm run build:backend
git status --short
git add <changed files>
git commit -m "<message>"
```

Jeśli Docker działa, dodaj przed commitem:

```powershell
cmd /c npm run backend:verify
```

## Full App Workflow
Używaj przy zmianach Zepp app albo submit flow.

```powershell
cmd /c npm test
cmd /c npm run build
git status --short
git add -A
git commit -m "<message>"
```

Jeśli przygotowujesz store/release build, zamień `npm run build` na `npm run build:app`.

Jeśli zmieniłeś UI:

```powershell
cmd /c npm run test:playwright:screens
```

## Ostatnie Znane Wyniki
Z ostatniej sesji:
- `cmd /c npm test`: pass, 54 tests.
- `cmd /c npm run test:playwright:screens`: pass, 140 tests.
- Screenshoty phone leaderboard dla `en-US` i `pl-PL` po zmianie onboardingu zostały obejrzane.
- `cmd /c npm run build`: pass, bez bumpa wersji watch app.
- `cmd /c npm run build:backend`: pass.
- `cmd /c npm run backend:verify`: pass, 25 backend tests, Docker/Testcontainers aktywne.

## Docker Status Z Ostatniej Sesji
- `docker version` przechodzi w aktywnym środowisku.
- Testcontainers potrafi uruchomić LocalStack `4.1` podczas `cmd /c npm run backend:verify`.
- Pełny verify ujawnił i potwierdził naprawę dwóch realnych problemów testowych: deadlock w `ProjectionConcurrencyIntegrationTest` i reuse Spring context ze starym endpointem LocalStack.

## Kiedy Commitować
Commituj po:
- Udanym buildzie po zmianie kodu.
- Zakończeniu dokumentacyjnej partii pracy, jeśli użytkownik prosi o artefakty w repo.

Nie commituj:
- Po nieudanym buildzie.
- Jeśli working tree zawiera cudze, niezrozumiałe zmiany.
- Jeśli commit wymiesza niezależne prace bez potrzeby.
