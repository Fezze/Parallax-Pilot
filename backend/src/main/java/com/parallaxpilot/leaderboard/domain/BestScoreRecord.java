package com.parallaxpilot.leaderboard.domain;

import java.time.Instant;

public record BestScoreRecord(
    String playerId,
    String nickname,
    ScopeKind scopeKind,
    String scopeKey,
    int score,
    long survivedMs,
    Instant playedAt
) {
}
