# ADR-0001: Best Score as Source of Truth

## Status

Accepted

## Context

The leaderboard needs fast reads, but it also needs correctness under retries, stale async work, and rebuild scenarios. If the projected leaderboard table becomes the source of truth, stale projection handling becomes harder and replay becomes less trustworthy.

## Decision

`best_scores` is the canonical source of truth for each player and scope.

`leaderboard_entries` is a projection optimized for reads.

## Consequences

- canonical ownership of rankable score is explicit
- stale projection tasks can be rejected against canonical best state
- projections can be rebuilt from canonical/logged data
- read model performance is separated from correctness rules

## Alternatives considered

- treat `leaderboard_entries` as the only truth: simpler read path, but weaker rebuildability and harder stale-task correctness
- compute ranking only from submission log: strongest audit trail, but too expensive and awkward for normal reads