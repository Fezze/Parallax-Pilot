# ADR-0007: LocalStack Testcontainers Validation

## Status

Accepted

## Context

The backend depends on DynamoDB, SQS, and S3 behavior. Pure unit tests are not enough to validate projection flow, idempotency, queue behavior, and snapshot export.

## Decision

Use LocalStack with Testcontainers for AWS-like integration testing in local development and verification.

## Consequences

- stronger confidence in repository and service interaction behavior
- realistic local validation of projection and rebuild paths
- Docker becomes a requirement for full `backend:verify`

## Alternatives considered

- mock all AWS services: faster, but much weaker architectural confidence
- require real AWS for integration testing: higher cost and less practical local workflow