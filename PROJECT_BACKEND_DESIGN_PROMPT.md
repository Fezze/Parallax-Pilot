# Portfolio Backend Design Prompt

Use this document as the source prompt and design brief for generating the backend architecture, deeper design details, and later implementation plans for the project.

The goal is not just to produce a working backend. The goal is to produce a backend design that looks thoughtful, production-oriented, scalable, and portfolio-worthy.

---

## Role

Act as a senior staff-level backend architect and system design partner.

You are helping design a **portfolio-grade backend** for a game leaderboard platform. The result should feel like the work of someone who understands real backend engineering, distributed systems trade-offs, cloud deployment, operational maturity, abuse prevention, and practical product design.

This is not a toy answer. I want something impressive, coherent, and realistic enough that I can use it as the backbone of a strong portfolio project.

---

## Project context

Design the backend for a **single-player watch game**.

### Core product facts
- The game runs on a watch device
- It is single-player only
- The client submits a score after a round
- The score is essentially **survival time**
- The backend stores and exposes leaderboard information
- The backend should also tell the player **where this round would rank**
- If the score is far from the top, it is acceptable to return an **approximate rank band / percentile / range** rather than an exact rank
- Leaderboards must support:
  - **global leaderboard**
  - **daily leaderboard**
  - **seasonal leaderboard**
- Friends leaderboard is out of scope
- Traditional login is **not required in v1**
- The watch platform may not support a normal login flow well
- If identity is needed, use a lightweight anonymous identity model such as install ID, device-bound identity, anonymous player token, nickname-bound identity, or similar

### Important system assumption
Even though the product is a watch game, **assume for system design purposes that it becomes one of the biggest global games in the world**.

That means:
- huge read traffic
- very large write traffic
- global multi-region traffic
- major bursts after updates, new seasons, and daily resets
- large-scale leaderboard reads
- high product visibility
- meaningful abuse pressure

At the same time, the design should still show **good engineering judgment**, not mindless overengineering.

---

## Product and trust model

The client reports the score.

That means:
- the client is **not fully trustworthy**
- the backend can validate shape, sanity, rate, replay, and suspicious patterns
- but the backend cannot fully prove the score is genuine if the client is authoritative for survival time
- the design must be honest about anti-cheat limitations
- the system should still include strong **anti-abuse and trust-hardening ideas** appropriate for a large public game

The primary product concern is **best score leaderboard behaviour**.

### Storage preference
- The core product can focus on **best score** rather than full permanent history of every round
- However, if an **append-only score submission log**, event log, or risk-analysis log helps with correctness, abuse detection, auditability, analytics, or recovery, include it as a justified secondary system
- Be clear about what is the **source of truth**, what is a **projection/materialized view**, and what is **optional supporting data**

---

## What I want from you

I want **one comprehensive design document** that can serve as the foundation for this project.

It should be good enough that I can later ask follow-up prompts such as:
- expand the API spec
- generate DB schema
- generate ADRs
- generate sequence diagrams
- generate infrastructure plan
- generate implementation roadmap
- implement the MVP
- implement the read path
- implement the score ingestion path
- implement anti-abuse protections
- implement observability

This means the document must be **dense, structured, and reusable**, not shallow.

---

## Design objectives

The backend design should optimize for the following:

1. **Portfolio quality**
   - It should look technically serious
   - It should show architectural judgment
   - It should be a good showcase project

2. **Production realism**
   - Correctness and failure modes matter
   - Operational concerns matter
   - Observability matters
   - Security matters

3. **Scalable read-heavy leaderboard design**
   - Leaderboards are the heart of the system
   - Top-N reads must be fast
   - Rank/classification must be practical at scale
   - Daily and seasonal scopes must be thought through carefully

4. **Pragmatic anti-abuse design**
   - Acknowledge the limits of client-authoritative scoring
   - Still include realistic mitigations

5. **Evolution path**
   - Show what the MVP looks like
   - Show how it evolves to large scale
   - Show which parts need strong design from day one
   - Show which parts can remain simple initially

---

## Output expectations

Produce a **single coherent document** with the following qualities:
- written like a serious architecture/design document
- practical, specific, and opinionated
- not just generic system design filler
- clear enough that it can drive later implementation
- broad enough that it covers architecture, APIs, data, operations, scaling, and evolution

Where multiple valid choices exist:
- recommend one preferred design
- explain why it is preferred
- mention alternatives and trade-offs briefly

---

## Required sections

Your output must include the following sections.

# 1. Executive summary
Provide a short but strong architecture summary.

This should explain:
- what the system does
- the key architectural idea
- the major scale challenges
- the preferred overall design approach
- why the design fits this product and trust model

# 2. Functional requirements
Define likely functional requirements, including at least:
- submit score
- update best score if improved
- store leaderboard data
- fetch global leaderboard
- fetch daily leaderboard
- fetch seasonal leaderboard
- fetch player’s best score
- return rank/classification for a submitted round
- support daily reset and seasonal reset behaviour
- support display-friendly leaderboard responses
- support optional nickname/profile metadata if justified

# 3. Non-functional requirements
Cover at least:
- availability
- latency expectations
- consistency expectations
- scalability
- durability
- resilience under burst load
- observability
- security
- abuse resistance
- cost-awareness

# 4. Assumptions and scope boundaries
Be explicit about:
- what is assumed
- what is ambiguous
- what is included in MVP
- what is intentionally excluded for now
- what is deferred to future versions

# 5. Domain model
Define the key conceptual entities, such as:
- anonymous player identity
- install/device identity
- score submission
- best score record
- leaderboard scope
- leaderboard entry
- daily leaderboard metadata
- seasonal leaderboard metadata
- optional anti-abuse/risk signal entity
- optional append-only score event log

Explain the responsibility of each entity.

# 6. High-level architecture
Design the high-level backend architecture.

Include:
- core services/components
- responsibilities of each component
- where state lives
- which parts are hot path
- which parts are asynchronous
- which parts are user-facing data plane
- which parts are control/admin/ops plane if relevant
- regional vs global concerns

Prefer a realistic cloud-hosted architecture.

# 7. Request flows
Explain the end-to-end request flow for at least:
- score submission
- best-score update
- global leaderboard fetch
- daily leaderboard fetch
- seasonal leaderboard fetch
- round-rank/classification lookup
- daily reset / seasonal reset

Make this concrete.

If useful, include sequence-style thinking and explicit sync vs async boundaries.

# 8. Identity model without login
Design identity for a large-scale public game without mandatory login.

Discuss:
- install ID vs device ID vs anonymous token
- nickname handling if included
- reinstall behaviour
- device replacement behaviour
- collision/duplication risk
- abuse/spam implications
- what identity properties are stable enough for leaderboard ownership

Recommend one preferred approach.

# 9. Data storage strategy
Design storage at a conceptual level.

Cover:
- primary write store
- best-score store
- leaderboard projection/index store
- append-only submission/event log if used
- cache layer
- archival/retention strategy
- backup strategy

Explain why each exists.

# 10. Data model and indexing
Propose concrete storage-oriented modeling ideas.

Include:
- keys
- access patterns
- indexes
- partitioning/sharding ideas
- hot key / hot partition risks
- how daily/global/seasonal scopes are represented
- how best score per scope is maintained
- how leaderboard top-N queries stay fast
- how exact rank / approximate rank are supported

Be specific and practical.

# 11. API and contract design
Design the backend API.

At minimum include contracts for:
- submit score
- fetch player best score
- fetch global leaderboard
- fetch daily leaderboard
- fetch seasonal leaderboard
- fetch classification/rank for current round
- optional fetch around-player leaderboard window if justified

For each, discuss:
- request shape
- response shape
- error model
- idempotency
- pagination
- versioning
- backward compatibility
- retry behaviour

# 12. Leaderboard logic and ranking model
This is one of the most important sections.

Explain in depth:
- what counts as the player’s canonical best score
- whether best score is per global/daily/seasonal scope or derived from a shared base model
- how ties are handled
- how lower-than-best submissions are treated
- how improved-best submissions are treated
- whether leaderboard is updated on write, on read, or through asynchronous materialization
- how top results are served efficiently
- how around-player ranking could work if supported
- how rank/classification for “this round” works
- when to return exact rank vs approximate band / percentile / bucket
- how daily and seasonal resets are implemented safely at scale

# 13. Capacity and scale estimates
Provide back-of-the-envelope capacity planning.

Include:
- write traffic estimates
- read traffic estimates
- expected amplification
- leaderboard read skew
- burst scenarios
- reset-day behaviour
- top-N hot-read behaviour
- storage growth
- event volume if append-only submissions are stored

Use concrete reasoning.

# 14. Correctness and consistency
Explain correctness in a practical way.

Include:
- duplicate submission handling
- idempotency design
- safe retries
- concurrent submissions from same identity
- race conditions in best-score updates
- consistency needs for best-score truth
- consistency needs for top leaderboard views
- consistency needs for player-visible rank/classification
- where eventual consistency is acceptable
- what recovery looks like after partial failure

This should be grounded in real engineering concerns, not abstract CAP-only discussion.

# 15. Anti-abuse and trust-hardening
This is another very important section.

Assume the score can be faked.

Discuss:
- what the server can trust
- what the server cannot trust
- sanity validation for submitted score/time
- replay protection
- dedupe tokens / submission IDs
- request signing or attestation options if useful
- rate limiting
- per-identity throttling
- anomaly detection
- suspicious-score flagging
- shadow banning / flagging / quarantine ideas if appropriate
- abuse vs cost trade-offs
- realistic security posture for a portfolio project

Be honest: this is not full anti-cheat if the client is authoritative.

# 16. Caching and read optimization
Leaderboards are read-heavy.

Explain:
- what should be cached
- what should not be cached blindly
- cache invalidation/update strategy
- precomputed/materialized top-N lists
- edge/CDN usage if relevant
- daily/seasonal/global freshness expectations
- around-player view considerations
- exact-rank vs approximate-rank read cost trade-offs

# 17. Reliability and operations
Explain the operational design.

Include:
- logs
- metrics
- traces if relevant
- alerting
- overload handling
- backpressure
- graceful degradation
- replay/rebuild capability
- backup and restore
- disaster recovery
- operational dashboards
- debugging wrong-rank bugs
- debugging duplicate submissions
- debugging leaderboard lag

# 18. Security and privacy
Cover:
- secure write endpoints
- input validation
- abuse-resistant endpoint behaviour
- secret handling
- environment configuration
- privacy for anonymous identities
- safe logging practices
- authn/authz thinking even without classic user login
- admin/ops endpoint protection if any exist

# 19. Multi-region and global architecture
Assume worldwide scale.

Explain:
- whether writes are regional, global, or home-region routed
- how global leaderboard views are built
- how daily/seasonal boards behave across regions and time zones
- latency trade-offs
- failover trade-offs
- whether exact global ranking is synchronous or materialized
- where strong coordination is worth it and where it is not

# 20. Cloud deployment model
Propose a realistic cloud deployment approach.

Cover:
- service packaging/deployment style
- data storage deployment style
- queue/stream usage if any
- cache deployment
- regional layout
- edge layer
- secrets/config
- CI/CD expectations
- rollout strategy

Keep it realistic and portfolio-worthy.

# 21. MVP vs hyperscale evolution path
This section must clearly separate stages.

Describe:
- **MVP architecture**
- **growth architecture**
- **true global-scale architecture**

For each stage explain:
- what stays simple
- what changes
- what breaks first
- what gets introduced later
- what should be designed carefully from day one because it is painful to retrofit

# 22. Implementation roadmap
Give a practical implementation order.

For example:
- phase 1 core ingestion + best score
- phase 2 leaderboard reads
- phase 3 daily/seasonal scopes
- phase 4 caching/materialization
- phase 5 anti-abuse/risk signals
- phase 6 observability and admin tooling
- phase 7 scale-hardening

This section should be directly useful for building the project.

# 23. Recommended architecture decision summary
Provide a crisp decision summary.

For each major topic, include:
- recommended choice
- why it is recommended
- main trade-off
- why alternatives were not chosen first

# 24. “Keep simple for now” vs “Design carefully from day one”
Create a very explicit checklist/table.

Examples of areas to classify:
- identity
- score submission API
- best-score update logic
- leaderboard materialization
- exact ranking strategy
- approximate rank strategy
- anti-abuse
- caching
- multi-region
- daily reset
- seasonal reset
- observability
- analytics/event log
- admin/ops tooling

# 25. Optional “showpiece” enhancements
Since this is a portfolio project, include a section with tasteful optional enhancements that make the project look stronger, for example:
- around-player leaderboard windows
- percentile/band classification
- suspicious-score shadow flagging
- replay-safe idempotent submission design
- append-only score event log plus projection rebuild
- materialized top-N views
- leaderboard snapshots
- admin/debug dashboard
- seasonal cutover tooling
- ADR set for key decisions
- event-driven analytics side pipeline
- chaos/failure testing ideas

These should remain believable and coherent, not random buzzword additions.

---

## Style requirements

Please write the result like a serious architecture document.

### Do:
- be practical
- be specific
- explain trade-offs
- use realistic backend reasoning
- identify dangerous edge cases
- distinguish source of truth from projections/caches
- explain failure modes
- explain scaling path
- explain operational consequences

### Do not:
- write only vague theory notes
- overuse buzzwords without concrete reasoning
- propose huge complexity without explaining why
- assume the client can be trusted just because the game is simple
- skip the hard parts of ranking, abuse, idempotency, or operational debugging

---

## Important framing guidance

Do not assume that because the game itself is simple, the backend is simple.

The main difficulty is not game logic.
The main difficulty is:
- large-scale score ingestion
- best-score correctness
- rank computation at scale
- fast leaderboard reads
- daily and seasonal scope handling
- global ranking trade-offs
- idempotency and duplicate handling
- practical abuse prevention for client-reported scores
- rebuild/recovery/debuggability

That is what the design should focus on.

---

## Final instruction

Produce the design as if you were creating the foundational architecture document for a serious backend portfolio project that should make an experienced backend engineer look strong.

The result should be coherent enough that it can directly drive later detailed design and implementation work.
