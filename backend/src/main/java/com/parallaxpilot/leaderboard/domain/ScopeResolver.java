package com.parallaxpilot.leaderboard.domain;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.List;

import org.springframework.stereotype.Component;

@Component
public class ScopeResolver {

    public List<ScopeKey> resolve(Instant playedAt) {
        var utc = ZonedDateTime.ofInstant(playedAt, ZoneOffset.UTC);
        var quarter = ((utc.getMonthValue() - 1) / 3) + 1;

        return List.of(
            new ScopeKey(ScopeKind.GLOBAL, "global"),
            new ScopeKey(ScopeKind.DAILY, utc.toLocalDate().toString()),
            new ScopeKey(ScopeKind.SEASONAL, utc.getYear() + "-Q" + quarter)
        );
    }
}
