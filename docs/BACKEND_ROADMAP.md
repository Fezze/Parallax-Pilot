# Backend Roadmap

Handoff for the next agent lives in `docs/BACKEND_HANDOFF.md`.

## Current status
Addressed:
- Spring Boot API scaffold
- basic submit and leaderboard endpoints
- LocalStack bootstrap for DynamoDB, SQS, and S3
- backend integration tests with LocalStack
- backend coverage reporting on `mvn verify`
- dedicated idempotency table
- conditional writes for `best_scores`
- async SQS-backed projection pipeline for `leaderboard_entries`
- replay/rebuild from `score_submissions`
- `around-me` leaderboard window
- baseline approximate rank banding outside exact rank window
- anti-abuse baseline with rate limit, risk log, and quarantine
- seasonal metadata and manual cutover endpoint
- concurrency tests for parallel submissions
- basic `global/daily/seasonal` scope model
- Zepp `Side Service` and `Settings App`
- screenshot coverage for the phone leaderboard screen
- watch -> `Side Service` score submit with offline queues
- projection dedupe and dedicated worker runtime profile
- automated seasonal rollover
- S3 snapshot export endpoint
- admin submission debug endpoint
- basic structured logs and Micrometer counters
- baseline GitHub Actions backend workflow
- baseline Terraform for DynamoDB/SQS/S3/CloudWatch/ECR

Missing or partial:
- anti-abuse is only a baseline and does not include richer anomaly heuristics
- observability is basic counters/logs, not dashboards/alerts yet
- CI/CD and Terraform are baseline only; no promotion/apply gates yet

## Roadmap
### Phase 1: Correctness baseline
- Extend conditional writes from `best_scores` to the remaining write path and add safer projection dedupe.
- Harden the dedicated idempotency record keyed by `submissionId` with TTL lifecycle and replay semantics.
- Replace the generic JSON repository shape with explicit source-of-truth and projection records.
- Add request validation for score, time, and device metadata plus a consistent error model.

### Phase 1 — plan implementacji (zadania wykonawcze)

Priorytet: wysoki — celem jest zapewnienie deterministycznej poprawności zapisów i odporności na duplikaty przed dalszym rozwojem asynchronicznym.

Checklist (wykonawcze):
- [ ] Walidacja żądań
	- DTO: `ScoreSubmissionRequest` z JSR-303 (`@NotNull`, `@Min`/`@Max`, format czasu).
	- Globalny handler błędów -> spójny model `ErrorResponse`.
	- Unit + integracyjne testy walidacji.

- [ ] Idempotency
	- Schemat tabeli idempotency: `submissionId` (PK), `status`, `createdAt`, `ttl`.
	- Repo + service: atomowy check-and-put (put-if-absent) oraz TTL lifecycle.
	- Testy jednostkowe i integracyjne (konkurencyjne duplikaty).

- [ ] Conditional writes: rozszerzenie
	- Zastosować conditional writes dla wszystkich krytycznych zapisów (`leaderboard_entries`, `best_scores`, inne projekcje).
	- Testy konkurencyjne i scenariusze wyścigów.

- [ ] Projekcja — deduplikacja i worker
	- Wyodrębnić logikę projekcji do dedykowanego worker'a (sketch + interface).
	- Deduplikacja po `submissionId` (tablica processed / token dedupe).
	- Replay-safe semantics (idempotent processing + replays możliwe bez podwójnych wpisów).
	- Integracyjne testy replay + worker.

- [ ] Zastąpienie generycznego JSON repo
	- Zdefiniować explicite source-of-truth records i projection records (schematy, konwertery).
	- Migracje / dokumentacja schematów.
	- Testy serializacji i konwersji.

- [ ] Testy i walidacja
	- Integration tests z LocalStack (DynamoDB/SQS/S3) dla krytycznych flow.
	- Concurrency tests (równoległe submity) w ramach `mvn verify`.
	- Coverage reporting włączony na `mvn verify`.

- [ ] Screenshoty / UI
	- Jeśli dodawane są nowe ekrany/admin UI: dodać Playwright screenshot scenario dla każdego nowego ekranu.
	- Screenshoty muszą pokrywać istniejącą matrycę locale/shape/resolution używaną w repo.

Z kryteriami akceptacji:
- Wszystkie powyższe zadania ukończone i oznaczone (checkboxy).
- `mvn verify` (pełen build + integracyjne z LocalStack) przechodzi bez błędów.
- Concurrency tests wykazują brak duplikatów / poprawną idempotencję.
- Dla zmian UI: wygenerowane Playwright screenshoty sprawdzone i zaakceptowane (zgodność z matrycą).

Kroki zamknięcia przy każdej zmianie:
1. Uruchom: `mvn -DskipTests=false verify` (lokalnie z LocalStack).
2. Jeśli build OK -> stwórz commit z opisem zakresu prac.
3. Otwórz PR z checklistą testów i linkami do artefaktów (build/logi/screenshoty).

Krótki harmonogram (orientacyjny):
- Tydzień 1: walidacja żądań, globalny handler, podstawowy idempotency service + testy.
- Tydzień 2: rozszerzenie conditional writes + concurrency tests.
- Tydzień 3: worker dedupe + replay tests + integracje z LocalStack.
- Tydzień 4: dokumentacja schematów, migracje, końcowe testy i commit.

Uwagi operacyjne:
- Zgodnie z regułami projektu: każda zmiana kodu kończy się uruchomieniem buildu i commitem; każda zmiana UI musi mieć Playwright screenshot coverage.
- Trzymać matrycę screensize/locale/shape spójną z istniejącymi testami w repo.

### Phase 2: Async leaderboard processing
- Keep append-only `score_submissions` as the only replay input.
- Extract projection processing into a dedicated worker deployment instead of in-process polling.
- Add projection dedupe/drift protection for `leaderboard_entries`.
- Harden replay flows with admin safety checks and rebuild observability.
- Add S3 snapshot export for recovery and leaderboard drift debugging.

### Phase 3: Ranking quality
- Finalize tie-break rules and stable rank behavior for ties.
- Add safe daily and seasonal reset flow with atomic active-scope switching.
- Add season rollover automation instead of manual cutover only.

### Phase 4: Abuse resistance
- Extend suspicious submission rules with replay patterns, version anomalies, and richer heuristics.
- Add per-device/IP throttling in addition to current player-based throttling.
- Add admin/debug tooling for submission inspection and rank divergence checks.

### Phase 5: Operability
- Add structured logging with `submissionId`, `playerId`, `scope`, and `correlationId`.
- Add Micrometer metrics for submit latency, duplicate ratio, projection lag, and leaderboard read latency.
- Add health/readiness checks and LocalStack smoke checks.
- Add dashboards and alerts for queue backlog, projection failures, and suspicious traffic spikes.
- Extend concurrency tests to projection drift and queue replay edge cases.

### Phase 6: Delivery
- Add CI for backend tests, frontend tests, and screenshot validation.
- Add backend build/deploy pipeline for `local`, `staging`, and `prod`.
- Add backend-only versioning independent of the watch app.
- Add a release checklist for backend and companion phone-side changes.
