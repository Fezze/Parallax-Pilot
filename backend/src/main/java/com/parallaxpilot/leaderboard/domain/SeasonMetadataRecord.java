package com.parallaxpilot.leaderboard.domain;

import java.time.Instant;

public record SeasonMetadataRecord(
    String seasonKey,
    Instant startsAt,
    Instant endsAt,
    boolean active
) {
}
