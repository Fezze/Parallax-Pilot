package com.parallaxpilot.leaderboard.service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.Comparator;
import java.util.Optional;

import org.springframework.stereotype.Service;

import com.parallaxpilot.leaderboard.domain.SeasonMetadataRecord;
import com.parallaxpilot.leaderboard.repository.DynamoDbJsonRepository;

@Service
public class SeasonService {

    private final DynamoDbJsonRepository repository;

    public SeasonService(DynamoDbJsonRepository repository) {
        this.repository = repository;
    }

    public String resolveSeasonKey(Instant playedAt) {
        return findSeasonFor(playedAt)
            .map(SeasonMetadataRecord::seasonKey)
            .orElseGet(() -> fallbackQuarter(playedAt));
    }

    public Optional<SeasonMetadataRecord> getActiveSeason() {
        return repository.scanAll("season_metadata", SeasonMetadataRecord.class).stream()
            .filter(SeasonMetadataRecord::active)
            .max(Comparator.comparing(SeasonMetadataRecord::startsAt));
    }

    public SeasonMetadataRecord cutover(String seasonKey, Instant startsAt) {
        var all = repository.scanAll("season_metadata", SeasonMetadataRecord.class);
        for (var season : all) {
            if (season.active()) {
                repository.put(
                    "season_metadata",
                    "season",
                    season.seasonKey(),
                    new SeasonMetadataRecord(season.seasonKey(), season.startsAt(), startsAt, false)
                );
            }
        }

        var next = new SeasonMetadataRecord(seasonKey, startsAt, null, true);
        repository.put("season_metadata", "season", seasonKey, next);
        return next;
    }

    private Optional<SeasonMetadataRecord> findSeasonFor(Instant playedAt) {
        return repository.scanAll("season_metadata", SeasonMetadataRecord.class).stream()
            .filter(season -> !playedAt.isBefore(season.startsAt()))
            .filter(season -> season.endsAt() == null || playedAt.isBefore(season.endsAt()))
            .max(Comparator.comparing(SeasonMetadataRecord::startsAt));
    }

    private String fallbackQuarter(Instant playedAt) {
        var utc = ZonedDateTime.ofInstant(playedAt, ZoneOffset.UTC);
        var quarter = ((utc.getMonthValue() - 1) / 3) + 1;
        return utc.getYear() + "-Q" + quarter;
    }
}
