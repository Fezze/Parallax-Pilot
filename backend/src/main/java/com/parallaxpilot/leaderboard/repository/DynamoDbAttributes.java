package com.parallaxpilot.leaderboard.repository;

public final class DynamoDbAttributes {

    public static final String PK = "pk";
    public static final String SK = "sk";
    public static final String PAYLOAD = "payload";
    public static final String SCORE = "score";
    public static final String SURVIVED_MS = "survivedMs";
    public static final String PLAYED_AT = "playedAt";
    public static final String CREATED_AT = "createdAt";
    public static final String EXPIRES_AT = "expiresAt";
    public static final String COUNT = "count";

    private DynamoDbAttributes() {
    }
}
