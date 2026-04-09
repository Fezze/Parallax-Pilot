# Backlog

## P1
- Add a real watch-to-`Side Service` score transport; today the phone leaderboard exists, but watch submit is not wired end-to-end.
- Move leaderboard projection updates out of the request path into an async SQS worker; the current shape does not match the target architecture and will not scale cleanly.
- Extend conditional writes and dedupe beyond `best_scores`, especially for projection writes and replay safety.
- Add concurrency tests against LocalStack for parallel submissions of the same player.
- Add backend-only versioning and release rules so backend-only work does not bump the watch app version.

## P2
- Add anti-abuse baseline: rate limiting, suspicious submission rules, risk log, and quarantine flow.
- Add replay/rebuild tooling from `score_submissions` into `best_scores` and `leaderboard_entries`.
- Add seasonal metadata and an explicit cutover job instead of deriving active seasonal behavior only from current time.
- Add `around-me` endpoint and a stable approximate-rank model outside the exact top window.
- Add structured logs, metrics, and basic alerting/dashboarding for submits, duplicates, and projection lag.
- Add Terraform for AWS infrastructure so environments are provisioned from code instead of ad hoc setup.
- Add GitHub Actions delivery pipeline for backend build, test, artifact publish, and environment deploy flow on top of the existing app pipeline assumptions.

## P3
- Replace demo defaults in `Settings App` and `Side Service` with real player identity onboarding and API configuration flow.
- Add offline queueing in `Side Service` so submit and refresh do not get lost without network.
- Add admin/debug view for rank divergence, duplicate submissions, and suspicious flags.
- Add S3 snapshot export for recovery and leaderboard projection comparison.
- Add Terraform plan/apply promotion flow per environment with remote state, secrets wiring, and approval gates.
- Add CI/CD for backend and companion phone-side with a dedicated release pipeline.
