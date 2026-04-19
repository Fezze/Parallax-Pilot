package com.parallaxpilot.leaderboard.api.validation;

import java.time.Duration;
import java.time.Instant;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class SubmissionPlayedAtValidator implements ConstraintValidator<SubmissionPlayedAt, Instant> {

    private static final Duration MAX_FUTURE_SKEW = Duration.ofMinutes(5);

    @Override
    public boolean isValid(Instant value, ConstraintValidatorContext context) {
        return value == null || !value.isAfter(Instant.now().plus(MAX_FUTURE_SKEW));
    }
}