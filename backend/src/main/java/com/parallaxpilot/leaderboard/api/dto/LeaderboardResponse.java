package com.parallaxpilot.leaderboard.api.dto;

import java.util.List;

public record LeaderboardResponse(
    String scope,
    String scopeKey,
    List<LeaderboardEntryResponse> entries,
    Integer totalPlayers
) {
}
