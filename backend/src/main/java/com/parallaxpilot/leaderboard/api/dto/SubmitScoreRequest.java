package com.parallaxpilot.leaderboard.api.dto;

import java.time.Instant;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record SubmitScoreRequest(
    @NotBlank String submissionId,
    @NotBlank String playerId,
    String nickname,
    @Min(1) int score,
    @Min(1) long survivedMs,
    @NotNull Instant playedAt,
    @NotBlank String clientVersion,
    String deviceModel
) {
}
