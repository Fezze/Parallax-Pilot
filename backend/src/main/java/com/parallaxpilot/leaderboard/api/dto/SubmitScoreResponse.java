package com.parallaxpilot.leaderboard.api.dto;

public record SubmitScoreResponse(
    boolean accepted,
    boolean duplicate,
    boolean bestUpdated,
    RankClassificationResponse classification
) {
}
