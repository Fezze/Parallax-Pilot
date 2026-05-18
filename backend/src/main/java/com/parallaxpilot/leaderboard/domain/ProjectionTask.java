package com.parallaxpilot.leaderboard.domain;

import java.time.Instant;

public record ProjectionTask(
    String submissionId,
    String playerId,
    String nickname,
    ScopeKind scopeKind,
    String scopeKey,
    int score,
    long survivedMs,
    Instant playedAt
) {
}
