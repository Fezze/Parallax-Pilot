package com.parallaxpilot.leaderboard.api.dto;

public record RankClassificationResponse(
    String playerId,
    Integer exactRank,
    String approximateBand,
    String scope
) {
}
