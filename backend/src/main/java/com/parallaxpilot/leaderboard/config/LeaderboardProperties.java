package com.parallaxpilot.leaderboard.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.leaderboard")
public record LeaderboardProperties(String tablePrefix, int exactRankThreshold, int idempotencyTtlDays) {
}
