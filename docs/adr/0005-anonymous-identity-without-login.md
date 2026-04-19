# ADR-0005: Anonymous Identity Without Login

## Status

Accepted

## Context

The product is a single-player watch game in v1. Full identity and login flows would add friction and platform complexity that the product does not yet justify.

## Decision

Use lightweight anonymous identity instead of a full login flow in v1.

## Consequences

- lower onboarding friction
- simpler client and backend flows
- limitations remain around reinstall, device replacement, and anti-fraud guarantees

## Alternatives considered

- mandatory user login in v1: more friction and more product scope than needed
- device-only identity with no stable player identifier: weaker continuity across sessions