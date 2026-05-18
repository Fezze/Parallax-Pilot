package com.parallaxpilot.leaderboard.domain;

public final class RiskSignals {

    public static final String RATE_LIMIT = "rate-limit";
    public static final String SCORE_OUTLIER = "score-outlier";
    public static final String SURVIVAL_OUTLIER = "survival-outlier";
    public static final String SEVERITY_HIGH = "high";
    public static final String SEVERITY_MEDIUM = "medium";

    private RiskSignals() {
    }
}
