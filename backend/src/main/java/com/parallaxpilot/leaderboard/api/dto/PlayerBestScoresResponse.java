package com.parallaxpilot.leaderboard.api.dto;

import java.util.Map;

public record PlayerBestScoresResponse(
    String playerId,
    Map<String, ScoreView> bestScores
) {
    public record ScoreView(int score, long survivedMs, String playedAt) {
    }
}
