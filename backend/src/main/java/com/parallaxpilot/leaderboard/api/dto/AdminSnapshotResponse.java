package com.parallaxpilot.leaderboard.api.dto;

public record AdminSnapshotResponse(
    String bucketName,
    String snapshotKey,
    int submissions,
    int bestScores,
    int leaderboardEntries,
    int riskSignals
) {
}
