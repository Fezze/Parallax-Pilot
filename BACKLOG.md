# Backlog

## P1
- Add a real watch-to-`Side Service` score transport; today the phone leaderboard exists, but watch submit is not wired end-to-end.
- Add projection dedupe and stronger consistency guarantees for `leaderboard_entries`, especially for replay and queue redelivery safety.
- Split projection processing into a dedicated worker runtime instead of in-process scheduled draining.
- Add backend-only versioning and release rules so backend-only work does not bump the watch app version.

## P2
- Extend anti-abuse beyond the current baseline with IP/device throttling and richer anomaly rules.
- Add automated seasonal rollover/reset jobs instead of manual cutover only.
- Finalize rank stability and tie-break behavior for equal scores.
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
