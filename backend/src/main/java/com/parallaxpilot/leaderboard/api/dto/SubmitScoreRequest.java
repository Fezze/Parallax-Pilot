package com.parallaxpilot.leaderboard.api.dto;

import java.time.Instant;

import com.parallaxpilot.leaderboard.api.validation.SubmissionPlayedAt;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SubmitScoreRequest(
    @NotBlank @Size(min = 8, max = 80) @Pattern(regexp = "^[A-Za-z0-9._:-]+$", message = "submissionId contains unsupported characters") String submissionId,
    @NotBlank @Size(min = 6, max = 64) @Pattern(regexp = "^[A-Za-z0-9-]+$", message = "playerId contains unsupported characters") String playerId,
    @Size(max = 24) @Pattern(regexp = "^[^\\p{Cntrl}]*$", message = "nickname contains unsupported characters") String nickname,
    @Min(1) @Max(1_000_000) int score,
    @Min(1) @Max(86_400_000) long survivedMs,
    @NotNull @SubmissionPlayedAt Instant playedAt,
    @NotBlank @Size(max = 32) @Pattern(regexp = "^[A-Za-z0-9._+-]+$", message = "clientVersion contains unsupported characters") String clientVersion,
    @Size(max = 64) @Pattern(regexp = "^[^\\p{Cntrl}]*$", message = "deviceModel contains unsupported characters") String deviceModel
) {

    public SubmitScoreRequest {
        submissionId = normalizeRequired(submissionId);
        playerId = normalizeRequired(playerId);
        nickname = normalizeOptional(nickname);
        clientVersion = normalizeRequired(clientVersion);
        deviceModel = normalizeOptional(deviceModel);
    }

    private static String normalizeRequired(String value) {
        return value == null ? null : value.trim();
    }

    private static String normalizeOptional(String value) {
        if (value == null) {
            return null;
        }

        var trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
