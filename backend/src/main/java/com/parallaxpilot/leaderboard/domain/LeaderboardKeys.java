package com.parallaxpilot.leaderboard.domain;

public final class LeaderboardKeys {

    public static final String SEASON_PARTITION = "season";
    public static final String SUBMISSION_PARTITION = "submission";
    public static final String REBUILD_LOCK_PARTITION = "rebuild";
    public static final String REBUILD_LOCK_SORT_KEY = "leaderboards";

    private LeaderboardKeys() {
    }

    public static String scopePartitionKey(ScopeKind scopeKind, String scopeKey) {
        return scopeKind.storageKey(scopeKey);
    }

    public static String playerRateLimitPartition(String playerId) {
        return "player#" + playerId;
    }
}
