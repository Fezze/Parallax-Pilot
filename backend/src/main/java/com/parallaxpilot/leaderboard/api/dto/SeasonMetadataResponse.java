package com.parallaxpilot.leaderboard.api.dto;

import java.time.Instant;

public record SeasonMetadataResponse(
    String seasonKey,
    Instant startsAt,
    Instant endsAt,
    boolean active
) {
}
