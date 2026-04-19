package com.parallaxpilot.leaderboard.service;

import java.time.Clock;
import java.time.Instant;
import java.time.Month;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.Comparator;
import java.util.Optional;
import java.util.regex.Pattern;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.parallaxpilot.leaderboard.domain.SeasonMetadataRecord;
import com.parallaxpilot.leaderboard.repository.SeasonMetadataRepository;

@Service
public class SeasonService {
    private static final Pattern QUARTER_SEASON_KEY = Pattern.compile("\\d{4}-Q[1-4]");

    private final SeasonMetadataRepository seasonRepository;
    private final Clock clock;

    public SeasonService(SeasonMetadataRepository seasonRepository, Clock clock) {
        this.seasonRepository = seasonRepository;
        this.clock = clock;
    }

    public String resolveSeasonKey(Instant playedAt) {
        return findSeasonFor(playedAt)
            .map(SeasonMetadataRecord::seasonKey)
            .orElseGet(() -> fallbackQuarter(playedAt));
    }

    public Optional<SeasonMetadataRecord> getActiveSeason() {
        return seasonRepository.findAll().stream()
            .filter(SeasonMetadataRecord::active)
            .max(Comparator.comparing(SeasonMetadataRecord::startsAt));
    }

    public SeasonMetadataRecord cutover(String seasonKey, Instant startsAt) {
        var all = seasonRepository.findAll();
        for (var season : all) {
            if (season.active()) {
                seasonRepository.put(new SeasonMetadataRecord(season.seasonKey(), season.startsAt(), startsAt, false));
            }
        }

        var next = new SeasonMetadataRecord(seasonKey, startsAt, null, true);
        seasonRepository.put(next);
        return next;
    }

    @Scheduled(cron = "${app.leaderboard.season-rollover-cron:0 5 0 * * *}", zone = "UTC")
    void scheduledSeasonRollover() {
        rolloverIfNeeded(clock.instant());
    }

    public Optional<SeasonMetadataRecord> rolloverIfNeeded(Instant now) {
        var nextSeasonKey = fallbackQuarter(now);
        var nextSeasonStart = quarterStart(now);
        var active = getActiveSeason();

        if (active.isPresent()) {
            var current = active.get();
            if (current.seasonKey().equals(nextSeasonKey)) {
                return Optional.empty();
            }
            if (!QUARTER_SEASON_KEY.matcher(current.seasonKey()).matches()) {
                return Optional.empty();
            }
            if (now.isBefore(nextSeasonStart)) {
                return Optional.empty();
            }
        }

        return Optional.of(cutover(nextSeasonKey, nextSeasonStart));
    }

    private Optional<SeasonMetadataRecord> findSeasonFor(Instant playedAt) {
        return seasonRepository.findAll().stream()
            .filter(season -> !playedAt.isBefore(season.startsAt()))
            .filter(season -> season.endsAt() == null || playedAt.isBefore(season.endsAt()))
            .max(Comparator.comparing(SeasonMetadataRecord::startsAt));
    }

    private String fallbackQuarter(Instant playedAt) {
        var utc = ZonedDateTime.ofInstant(playedAt, ZoneOffset.UTC);
        var quarter = ((utc.getMonthValue() - 1) / 3) + 1;
        return utc.getYear() + "-Q" + quarter;
    }

    private Instant quarterStart(Instant instant) {
        var utc = ZonedDateTime.ofInstant(instant, ZoneOffset.UTC);
        var firstMonth = (((utc.getMonthValue() - 1) / 3) * 3) + 1;
        return ZonedDateTime
            .of(utc.getYear(), Month.of(firstMonth).getValue(), 1, 0, 0, 0, 0, ZoneOffset.UTC)
            .toInstant();
    }
}
