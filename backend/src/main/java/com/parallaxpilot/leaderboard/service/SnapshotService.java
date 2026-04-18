package com.parallaxpilot.leaderboard.service;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.List;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import com.parallaxpilot.leaderboard.api.dto.AdminSnapshotResponse;
import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.domain.BestScoreRecord;
import com.parallaxpilot.leaderboard.domain.LeaderboardEntry;
import com.parallaxpilot.leaderboard.domain.RiskSignalRecord;
import com.parallaxpilot.leaderboard.domain.ScoreSubmission;
import com.parallaxpilot.leaderboard.repository.DynamoDbJsonRepository;
import com.parallaxpilot.leaderboard.repository.LeaderboardTables;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

@Service
public class SnapshotService {

    private final S3Client s3Client;
    private final ObjectMapper objectMapper;
    private final DynamoDbJsonRepository repository;
    private final LeaderboardProperties properties;
    private final MeterRegistry meterRegistry;

    public SnapshotService(
        S3Client s3Client,
        ObjectMapper objectMapper,
        DynamoDbJsonRepository repository,
        LeaderboardProperties properties,
        MeterRegistry meterRegistry
    ) {
        this.s3Client = s3Client;
        this.objectMapper = objectMapper;
        this.repository = repository;
        this.properties = properties;
        this.meterRegistry = meterRegistry;
    }

    public AdminSnapshotResponse exportSnapshot() {
        if (!StringUtils.hasText(properties.snapshotBucketName())) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Snapshot bucket is not configured");
        }

        var submissions = repository.scanAll(LeaderboardTables.SCORE_SUBMISSIONS, ScoreSubmission.class);
        var bestScores = repository.scanAll(LeaderboardTables.BEST_SCORES, BestScoreRecord.class);
        var leaderboardEntries = repository.scanAll(LeaderboardTables.LEADERBOARD_ENTRIES, LeaderboardEntry.class);
        var riskSignals = repository.scanAll(LeaderboardTables.RISK_SIGNALS, RiskSignalRecord.class);
        var exportedAt = Instant.now();
        var snapshot = new LeaderboardSnapshot(
            exportedAt,
            submissions,
            bestScores,
            leaderboardEntries,
            riskSignals
        );
        var key = "leaderboard-snapshots/%s.json".formatted(
            DateTimeFormatter.ISO_INSTANT.format(exportedAt).replace(':', '-')
        );

        s3Client.putObject(
            PutObjectRequest.builder()
                .bucket(properties.snapshotBucketName())
                .key(key)
                .contentType("application/json")
                .build(),
            RequestBody.fromBytes(writeJson(snapshot))
        );
        meterRegistry.counter("leaderboard.snapshots.exported").increment();

        return new AdminSnapshotResponse(
            properties.snapshotBucketName(),
            key,
            submissions.size(),
            bestScores.size(),
            leaderboardEntries.size(),
            riskSignals.size()
        );
    }

    private byte[] writeJson(Object value) {
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(value);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Failed to serialize leaderboard snapshot", error);
        }
    }

    private record LeaderboardSnapshot(
        Instant exportedAt,
        List<ScoreSubmission> submissions,
        List<BestScoreRecord> bestScores,
        List<LeaderboardEntry> leaderboardEntries,
        List<RiskSignalRecord> riskSignals
    ) {
    }
}
