package com.parallaxpilot.leaderboard.domain;

import java.time.Instant;
import java.util.List;

public record ScoreSubmission(
    String submissionId,
    String playerId,
    String nickname,
    int score,
    long survivedMs,
    Instant playedAt,
    String clientVersion,
    String deviceModel,
    boolean suspicious,
    boolean quarantined,
    List<String> riskReasons
) {
}
