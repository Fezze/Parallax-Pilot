package com.parallaxpilot.leaderboard.domain;

import java.time.Instant;
import java.util.Comparator;

public final class LeaderboardRanking {

    public static final Comparator<LeaderboardEntry> ENTRY_ORDER = (left, right) -> compare(
        left.score(),
        left.survivedMs(),
        left.playedAt(),
        left.playerId(),
        right.score(),
        right.survivedMs(),
        right.playedAt(),
        right.playerId()
    );

    private LeaderboardRanking() {
    }

    public static int compare(
        int leftScore,
        long leftSurvivedMs,
        Instant leftPlayedAt,
        String leftPlayerId,
        int rightScore,
        long rightSurvivedMs,
        Instant rightPlayedAt,
        String rightPlayerId
    ) {
        int scoreComparison = Integer.compare(rightScore, leftScore);
        if (scoreComparison != 0) {
            return scoreComparison;
        }

        int survivedComparison = Long.compare(rightSurvivedMs, leftSurvivedMs);
        if (survivedComparison != 0) {
            return survivedComparison;
        }

        int playedAtComparison = leftPlayedAt.compareTo(rightPlayedAt);
        if (playedAtComparison != 0) {
            return playedAtComparison;
        }

        return leftPlayerId.compareTo(rightPlayerId);
    }

    public static String sortKey(int score, long survivedMs, Instant playedAt, String playerId) {
        long inverseScore = Integer.MAX_VALUE - score;
        long inverseSurvivedMs = Long.MAX_VALUE - survivedMs;
        return "%010d#%019d#%013d#%s".formatted(
            inverseScore,
            inverseSurvivedMs,
            playedAt.toEpochMilli(),
            playerId
        );
    }
}