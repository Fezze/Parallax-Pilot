# Backlog

Audience: AI agents only. Human-facing documentation belongs only in `README.md` files.

Agent takeover docs: `docs/TAKEOVER.md`.
Backend handoff summary: `docs/BACKEND_HANDOFF.md`.

## P1
- Runtime-verify watch-to-`Side Service` score submit on Zepp hardware or simulator, including ACK handling and offline queue flush after reconnect.

## P2
- Finish production deployment discipline: approved Terraform apply, environment protection, rollback/readiness checks, and validated real plan/apply.
- Add production observability layer: DynamoDB/SQS/S3 readiness checks, CloudWatch dashboard, queue/API/projection/quarantine alarms, and alert thresholds.
- Extend anti-abuse beyond the current baseline with IP/device throttling and richer anomaly rules.
- Add snapshot recovery tools: list/download snapshots, drift comparison, restore dry-run, and guarded restore path if needed.

## P3
- Add an admin/debug UI for submission investigation, with auth and Playwright screenshot coverage if a new screen is introduced.
- Confirm Zepp Store submission country/region fields in the console before final store submission.

## Done
- Backend-only versioning and release rules; `npm run build` no longer bumps the watch app version.
- Anonymous player identity onboarding replaced `demo-player` / `Pilot` defaults in active code.
- Terraform remote state bootstrap, managed secret scaffolding, runtime env/secrets wiring, CI image publish, manual plan, and ECS rollout scaffolding.
- Deterministic rank tie-break behavior for score, survival time, played-at time, and player id is implemented and covered by integration tests.
- Watch-to-`Side Service` score transport with BLE messaging and offline submit queues.
- Projection dedupe and dedicated worker runtime profile.
- Automated seasonal rollover/reset job.
- Structured logs and Micrometer counters for submit/projection/snapshot flows.
- S3 snapshot export endpoint.
- Admin submission debug endpoint.
- Baseline Terraform for DynamoDB/SQS/S3/CloudWatch/ECR.
- Backend GitHub Actions verification workflow.
