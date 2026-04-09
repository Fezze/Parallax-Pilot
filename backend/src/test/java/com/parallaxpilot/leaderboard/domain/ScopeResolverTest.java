package com.parallaxpilot.leaderboard.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;

import org.junit.jupiter.api.Test;

class ScopeResolverTest {

    private final ScopeResolver subject = new ScopeResolver();

    @Test
    void resolvesGlobalDailyAndSeasonalScopes() {
        var scopes = subject.resolve(Instant.parse("2026-04-09T12:00:00Z"));

        assertThat(scopes).containsExactly(
            new ScopeKey(ScopeKind.GLOBAL, "global"),
            new ScopeKey(ScopeKind.DAILY, "2026-04-09"),
            new ScopeKey(ScopeKind.SEASONAL, "2026-Q2")
        );
    }
}
