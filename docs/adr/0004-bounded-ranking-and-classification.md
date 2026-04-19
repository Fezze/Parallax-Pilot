# ADR-0004: Bounded Ranking and Classification

## Status

Accepted

## Context

The system should tell the player how they rank, but exact global rank at huge scale is not a synchronous requirement for this project stage. Pretending otherwise would make the documentation less honest than the implementation.

## Decision

Current ranking is bounded projection-based.

Exact rank is returned only within bounded design limits. Beyond that, approximate band classification is acceptable.

## Consequences

- current implementation stays simple and honest
- top-of-board and bounded reads are exact enough for the current product stage
- larger-scale evolution can move toward top-N materialization and bucket or histogram rank estimation

## Alternatives considered

- promise exact global synchronous rank everywhere: misleading for the real implementation
- omit classification entirely: simpler, but weaker player feedback and weaker portfolio value