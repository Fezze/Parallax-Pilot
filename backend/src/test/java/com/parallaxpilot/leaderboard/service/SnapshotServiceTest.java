package com.parallaxpilot.leaderboard.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

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

class SnapshotServiceTest {

    @Test
    void exportsSnapshotToConfiguredBucket() {
        var s3Client = Mockito.mock(S3Client.class);
        var repository = Mockito.mock(DynamoDbJsonRepository.class);
        var properties = new LeaderboardProperties(
            "pp_",
            100,
            14,
            "pp_score-submissions",
            2,
            20,
            100000,
            7200000,
            2000,
            5000,
            15,
            false,
            "pp-leaderboard-snapshots"
        );
        when(repository.scanAll(LeaderboardTables.SCORE_SUBMISSIONS, ScoreSubmission.class)).thenReturn(List.of());
        when(repository.scanAll(LeaderboardTables.BEST_SCORES, BestScoreRecord.class)).thenReturn(List.of());
        when(repository.scanAll(LeaderboardTables.LEADERBOARD_ENTRIES, LeaderboardEntry.class)).thenReturn(List.of());
        when(repository.scanAll(LeaderboardTables.RISK_SIGNALS, RiskSignalRecord.class)).thenReturn(List.of());

        var service = new SnapshotService(
            s3Client,
            new ObjectMapper().findAndRegisterModules(),
            repository,
            properties,
            new SimpleMeterRegistry()
        );

        var response = service.exportSnapshot();

        assertEquals("pp-leaderboard-snapshots", response.bucketName());
        verify(s3Client).putObject(any(PutObjectRequest.class), any(RequestBody.class));
        verify(repository).scanAll(eq(LeaderboardTables.SCORE_SUBMISSIONS), eq(ScoreSubmission.class));
    }
}
