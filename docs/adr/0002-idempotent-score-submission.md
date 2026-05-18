# ADR-0002: Idempotent Score Submission

## Status

Accepted

## Context

The client path includes watch, phone side service, BLE/messaging, and network calls. Retries are expected. A submit API that is not idempotent would double-apply writes or force the client into fragile retry logic.

## Decision

Submissions are idempotent by `submissionId`.

Duplicate submissions return an accepted duplicate response instead of being treated as server errors.

## Consequences

- client retries are safe
- duplicate transport behavior does not corrupt best-score state
- API contract is friendlier for unreliable device/network paths

## Alternatives considered

- non-idempotent submit with client-managed retry suppression: too fragile
- full exactly-once messaging semantics end to end: unnecessary complexity for this project stage