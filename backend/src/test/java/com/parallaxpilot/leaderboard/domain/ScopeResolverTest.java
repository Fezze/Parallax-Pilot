package com.parallaxpilot.leaderboard.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;

import org.junit.jupiter.api.Test;

import com.parallaxpilot.leaderboard.service.SeasonService;

class ScopeResolverTest {

    private final SeasonService seasonService = mock(SeasonService.class);
    private final ScopeResolver subject = new ScopeResolver(seasonService);

    @Test
    void resolvesGlobalDailyAndSeasonalScopes() {
        when(seasonService.resolveSeasonKey(Instant.parse("2026-04-09T12:00:00Z"))).thenReturn("2026-Q2");
        var scopes = subject.resolve(Instant.parse("2026-04-09T12:00:00Z"));

        assertThat(scopes).containsExactly(
            new ScopeKey(ScopeKind.GLOBAL, "global"),
            new ScopeKey(ScopeKind.DAILY, "2026-04-09"),
            new ScopeKey(ScopeKind.SEASONAL, "2026-Q2")
        );
    }
}
