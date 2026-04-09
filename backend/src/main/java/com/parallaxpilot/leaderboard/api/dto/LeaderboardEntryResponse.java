package com.parallaxpilot.leaderboard.api.dto;

public record LeaderboardEntryResponse(
    String playerId,
    String nickname,
    int score,
    long survivedMs,
    int rank
) {
}
