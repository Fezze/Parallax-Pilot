package com.parallaxpilot.leaderboard.api.validation;

import static java.lang.annotation.ElementType.FIELD;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

import java.lang.annotation.Retention;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

@Target({FIELD})
@Retention(RUNTIME)
@Constraint(validatedBy = SubmissionPlayedAtValidator.class)
public @interface SubmissionPlayedAt {

    String message() default "playedAt must not be more than 5 minutes in the future";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}