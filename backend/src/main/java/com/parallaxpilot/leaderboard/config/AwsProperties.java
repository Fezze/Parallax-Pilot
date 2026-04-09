package com.parallaxpilot.leaderboard.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "aws")
public record AwsProperties(String region, String endpoint) {
}
