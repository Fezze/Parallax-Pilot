# Backlog

## P1
- Add backend-only versioning and release rules so backend-only work does not bump the watch app version.

## P2
- Extend anti-abuse beyond the current baseline with IP/device throttling and richer anomaly rules.
- Finalize rank stability and tie-break behavior for equal scores.

## P3
- Replace demo defaults in `Settings App` and `Side Service` with real player identity onboarding and API configuration flow.
- Add Terraform plan/apply promotion flow per environment with remote state, secrets wiring, and approval gates.

## Done
- Watch-to-`Side Service` score transport with BLE messaging and offline submit queues.
- Projection dedupe and dedicated worker runtime profile.
- Automated seasonal rollover/reset job.
- Structured logs and Micrometer counters for submit/projection/snapshot flows.
- S3 snapshot export endpoint.
- Admin submission debug endpoint.
- Baseline Terraform for DynamoDB/SQS/S3/CloudWatch/ECR.
- Backend GitHub Actions verification workflow.
