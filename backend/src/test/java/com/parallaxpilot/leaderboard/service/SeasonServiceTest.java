package com.parallaxpilot.leaderboard.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import com.parallaxpilot.leaderboard.domain.SeasonMetadataRecord;
import com.parallaxpilot.leaderboard.repository.SeasonMetadataRepository;

class SeasonServiceTest {

    private final SeasonMetadataRepository seasonRepository = Mockito.mock(SeasonMetadataRepository.class);
    private final SeasonService subject = new SeasonService(
        seasonRepository,
        Clock.fixed(Instant.parse("2026-04-01T00:05:00Z"), ZoneOffset.UTC)
    );

    @Test
    void rolloverCreatesNextQuarterSeasonAndClosesPreviousOne() {
        var previous = new SeasonMetadataRecord(
            "2026-Q1",
            Instant.parse("2026-01-01T00:00:00Z"),
            null,
            true
        );
        when(seasonRepository.findAll()).thenReturn(List.of(previous));

        var result = subject.rolloverIfNeeded(Instant.parse("2026-04-01T00:05:00Z"));

        assertTrue(result.isPresent());
        assertEquals("2026-Q2", result.get().seasonKey());
        verify(seasonRepository).put(new SeasonMetadataRecord(
            "2026-Q1",
            Instant.parse("2026-01-01T00:00:00Z"),
            Instant.parse("2026-04-01T00:00:00Z"),
            false
        ));
        verify(seasonRepository).put(new SeasonMetadataRecord(
            "2026-Q2",
            Instant.parse("2026-04-01T00:00:00Z"),
            null,
            true
        ));
    }

    @Test
    void rolloverDoesNotOverrideCustomManualSeasonKeys() {
        var custom = new SeasonMetadataRecord(
            "2026-S2",
            Instant.parse("2026-04-01T00:00:00Z"),
            null,
            true
        );
        when(seasonRepository.findAll()).thenReturn(List.of(custom));

        var result = subject.rolloverIfNeeded(Instant.parse("2026-07-01T00:05:00Z"));

        assertTrue(result.isEmpty());
        verify(seasonRepository, never()).put(Mockito.any());
    }
}
