package com.parallaxpilot.leaderboard.api.validation;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import org.springframework.stereotype.Component;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

@Component
public class SubmissionPlayedAtValidator implements ConstraintValidator<SubmissionPlayedAt, Instant> {

    private static final Duration MAX_FUTURE_SKEW = Duration.ofMinutes(5);
    private final Clock clock;
    private final LeaderboardProperties properties;

    public SubmissionPlayedAtValidator(Clock clock, LeaderboardProperties properties) {
        this.clock = clock;
        this.properties = properties;
    }

    @Override
    public boolean isValid(Instant value, ConstraintValidatorContext context) {
        if (value == null) {
            return true;
        }

        var now = clock.instant();
        return !value.isAfter(now.plus(MAX_FUTURE_SKEW))
            && !value.isBefore(now.minus(Duration.ofDays(properties.maxSubmissionAgeDays())));
    }
}