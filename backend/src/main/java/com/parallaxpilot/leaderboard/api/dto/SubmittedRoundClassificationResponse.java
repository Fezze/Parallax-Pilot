package com.parallaxpilot.leaderboard.api.dto;

public record SubmittedRoundClassificationResponse(
    String scope,
    String scopeKey,
    int score,
    long survivedMs,
    Integer exactRank,
    String approximateBand,
    int totalPlayers,
    String classificationBasis,
    String availability
) {
}