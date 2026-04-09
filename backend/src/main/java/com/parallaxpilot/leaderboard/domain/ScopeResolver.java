package com.parallaxpilot.leaderboard.domain;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.List;

import org.springframework.stereotype.Component;

import com.parallaxpilot.leaderboard.service.SeasonService;

@Component
public class ScopeResolver {

    private final SeasonService seasonService;

    public ScopeResolver(SeasonService seasonService) {
        this.seasonService = seasonService;
    }

    public List<ScopeKey> resolve(Instant playedAt) {
        var utc = ZonedDateTime.ofInstant(playedAt, ZoneOffset.UTC);

        return List.of(
            new ScopeKey(ScopeKind.GLOBAL, "global"),
            new ScopeKey(ScopeKind.DAILY, utc.toLocalDate().toString()),
            new ScopeKey(ScopeKind.SEASONAL, seasonService.resolveSeasonKey(playedAt))
        );
    }
}
