package com.parallaxpilot.leaderboard.domain;

import java.time.Instant;

public record ScoreSubmission(
    String submissionId,
    String playerId,
    String nickname,
    int score,
    long survivedMs,
    Instant playedAt,
    String clientVersion,
    String deviceModel
) {
}
