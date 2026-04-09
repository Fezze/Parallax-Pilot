package com.parallaxpilot.leaderboard.api.dto;

import java.time.Instant;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record SeasonCutoverRequest(
    @NotBlank String seasonKey,
    @NotNull Instant startsAt
) {
}
