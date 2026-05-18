package com.parallaxpilot.leaderboard.domain;

import java.time.Instant;

public record RiskSignalRecord(
    String submissionId,
    String playerId,
    String reason,
    String severity,
    boolean quarantined,
    Instant createdAt
) {
}
