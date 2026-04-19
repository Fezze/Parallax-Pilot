# ADR-0003: Async Leaderboard Projection

## Status

Accepted

## Context

Leaderboard reads want a read-optimized shape, but canonical write correctness should stay simple. Writing the projected read model inline in the request path would couple response latency to all downstream updates and make replay/rebuild logic less explicit.

## Decision

Leaderboard projection is asynchronous through SQS.

The API updates canonical best-score state first, then publishes projection tasks. The worker drains the queue, rejects stale tasks, replaces old projected entries, and marks tasks processed.

## Consequences

- write path stays focused on canonical state
- projection lag is explicit and operationally visible
- replay and rebuild flows are cleaner
- eventual consistency is accepted for leaderboard visibility

## Alternatives considered

- synchronous inline projection updates: lower lag, but more write-path coupling and weaker operational separation
- direct stream/event platform migration now: unnecessary complexity for the current scope