# ADR-0006: Client-Authoritative Score Anti-Abuse

## Status

Accepted

## Context

The client reports score and survival results. On this platform, the backend cannot fully prove the score was produced honestly. The design still needs meaningful abuse resistance and honest documentation.

## Decision

Use pragmatic anti-abuse, not a claim of full anti-cheat.

The backend applies sanity checks, rate limits, suspicious/quarantine paths, risk signals, and admin debug tooling.

## Consequences

- the system is honest about trust boundaries
- obvious abuse is harder and more visible
- gameplay legitimacy is not cryptographically proven

## Alternatives considered

- claim full anti-cheat solved: inaccurate for this architecture
- do nothing beyond request validation: too weak operationally