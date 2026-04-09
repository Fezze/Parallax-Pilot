package com.parallaxpilot.leaderboard.domain;

public record ProjectionIndexRecord(
    String playerId,
    ScopeKind scopeKind,
    String scopeKey,
    String leaderboardSortKey
) {
}
