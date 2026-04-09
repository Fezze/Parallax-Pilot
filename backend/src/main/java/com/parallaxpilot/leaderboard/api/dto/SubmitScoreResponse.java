package com.parallaxpilot.leaderboard.api.dto;

import java.util.List;

public record SubmitScoreResponse(
    boolean accepted,
    boolean duplicate,
    boolean bestUpdated,
    boolean suspicious,
    boolean quarantined,
    List<String> riskReasons,
    RankClassificationResponse classification
) {
}
