package com.parallaxpilot.leaderboard.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.parallaxpilot.leaderboard.api.dto.SeasonCutoverRequest;
import com.parallaxpilot.leaderboard.api.dto.SubmitScoreRequest;
import com.parallaxpilot.leaderboard.domain.ProjectionTask;
import com.parallaxpilot.leaderboard.domain.ScopeKind;
import com.parallaxpilot.leaderboard.repository.ProjectionQueueRepository;
import com.parallaxpilot.leaderboard.service.LeaderboardService;
import com.parallaxpilot.leaderboard.support.LocalStackIntegrationSupport;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LeaderboardIntegrationTest extends LocalStackIntegrationSupport {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private LeaderboardService leaderboardService;

    @Autowired
    private ProjectionQueueRepository projectionQueueRepository;

    @BeforeAll
    static void bootstrap() {
        bootstrapResources();
    }

    @BeforeEach
    void reset() {
        resetResources();
    }

    @Test
    void submitThenReadLeaderboardAndBestScore() throws Exception {
        var request = new SubmitScoreRequest(
            "sub-int-1",
            "player-int-1",
            "Pilot",
            2200,
            18000,
            Instant.parse("2026-04-09T12:00:00Z"),
            "2.4.2",
            "balance-2"
        );

        mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsBytes(request)))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.accepted").value(true))
            .andExpect(jsonPath("$.duplicate").value(false))
            .andExpect(jsonPath("$.bestUpdated").value(true));

        mockMvc.perform(post("/v1/admin/projections:drain"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.processedMessages").value(3));

        mockMvc.perform(get("/v1/players/player-int-1/best"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.bestScores.global.score").value(2200))
            .andExpect(jsonPath("$.bestScores.daily.score").value(2200))
            .andExpect(jsonPath("$.bestScores.seasonal.score").value(2200));

        mockMvc.perform(get("/v1/leaderboards/global"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].playerId").value("player-int-1"))
            .andExpect(jsonPath("$.entries[0].score").value(2200));
    }

    @Test
    void duplicateSubmissionIsIdempotentAtApiLevel() throws Exception {
        var request = new SubmitScoreRequest(
            "sub-int-dup",
            "player-int-dup",
            "Comet",
            1700,
            14000,
            Instant.parse("2026-04-09T13:00:00Z"),
            "2.4.2",
            "balance-2"
        );

        mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsBytes(request)))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.duplicate").value(false));

        mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsBytes(request)))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.duplicate").value(true))
            .andExpect(jsonPath("$.bestUpdated").value(false));
    }

    @Test
    void lowerScoreDoesNotReplaceExistingBestScore() throws Exception {
        var betterRequest = new SubmitScoreRequest(
            "sub-int-best-1",
            "player-int-best",
            "Nova",
            2600,
            21000,
            Instant.parse("2026-04-09T14:00:00Z"),
            "2.4.3",
            "balance-2"
        );
        var worseRequest = new SubmitScoreRequest(
            "sub-int-best-2",
            "player-int-best",
            "Nova",
            1200,
            10000,
            Instant.parse("2026-04-09T14:05:00Z"),
            "2.4.3",
            "balance-2"
        );

        mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsBytes(betterRequest)))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.bestUpdated").value(true));

        mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsBytes(worseRequest)))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.bestUpdated").value(false));

        mockMvc.perform(get("/v1/players/player-int-best/best"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.bestScores.global.score").value(2600))
            .andExpect(jsonPath("$.bestScores.daily.score").value(2600))
            .andExpect(jsonPath("$.bestScores.seasonal.score").value(2600));
    }

    @Test
    void staleProjectionTaskDoesNotReintroduceOldLeaderboardEntry() throws Exception {
        var first = new SubmitScoreRequest(
            "sub-stale-1",
            "player-stale",
            "Stale",
            1800,
            12000,
            Instant.parse("2026-04-09T14:00:00Z"),
            "2.4.3",
            "balance-2"
        );
        var better = new SubmitScoreRequest(
            "sub-stale-2",
            "player-stale",
            "Stale",
            2600,
            18000,
            Instant.parse("2026-04-09T14:05:00Z"),
            "2.4.3",
            "balance-2"
        );

        mockMvc.perform(post("/v1/scores:submit").contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsBytes(first)))
            .andExpect(status().isAccepted());
        mockMvc.perform(post("/v1/scores:submit").contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsBytes(better)))
            .andExpect(status().isAccepted());
        mockMvc.perform(post("/v1/admin/projections:drain"))
            .andExpect(status().isOk());

        projectionQueueRepository.publish(new ProjectionTask(
            "stale-task",
            "player-stale",
            "Stale",
            ScopeKind.GLOBAL,
            "global",
            1800,
            12000,
            Instant.parse("2026-04-09T14:00:00Z")
        ));

        mockMvc.perform(post("/v1/admin/projections:drain"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.processedMessages").value(1));

        mockMvc.perform(get("/v1/leaderboards/global"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].playerId").value("player-stale"))
            .andExpect(jsonPath("$.entries[0].score").value(2600))
            .andExpect(jsonPath("$.totalPlayers").value(1));
    }

    @Test
    void aroundMeAndClassificationUseProjectedRankings() throws Exception {
        for (int index = 0; index < 6; index += 1) {
            var request = new SubmitScoreRequest(
                "sub-around-" + index,
                "player-around-" + index,
                "Pilot-" + index,
                3000 - (index * 100),
                20000 - (index * 500L),
                Instant.parse("2026-04-09T15:0" + index + ":00Z"),
                "2.4.3",
                "balance-2"
            );
            mockMvc.perform(post("/v1/scores:submit")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(request)))
                .andExpect(status().isAccepted());
        }

        mockMvc.perform(post("/v1/admin/projections:drain"))
            .andExpect(status().isOk());

        mockMvc.perform(get("/v1/leaderboards/global/around-me").param("playerId", "player-around-3"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].playerId").exists())
            .andExpect(jsonPath("$.totalPlayers").value(6));

        mockMvc.perform(get("/v1/rankings/classify").param("playerId", "player-around-5"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalPlayers").value(6));
    }

    @Test
    void quarantinedSubmissionDoesNotReachProjectionFlow() throws Exception {
        var request = new SubmitScoreRequest(
            "sub-risk-1",
            "player-risk-1",
            "Risky",
            250000,
            18000,
            Instant.parse("2026-04-09T16:00:00Z"),
            "2.4.3",
            "balance-2"
        );

        mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsBytes(request)))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.suspicious").value(true))
            .andExpect(jsonPath("$.quarantined").value(true));

        mockMvc.perform(post("/v1/admin/projections:drain"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.processedMessages").value(0));
    }

    @Test
    void seasonCutoverAndReplayRebuildProjections() throws Exception {
        mockMvc.perform(patch("/v1/admin/seasons:cutover")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsBytes(new SeasonCutoverRequest(
                    "2026-S2",
                    Instant.parse("2026-04-01T00:00:00Z")
                ))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.seasonKey").value("2026-S2"));

        var request = new SubmitScoreRequest(
            "sub-rebuild-1",
            "player-rebuild-1",
            "Replay",
            4100,
            22000,
            Instant.parse("2026-04-09T18:00:00Z"),
            "2.4.3",
            "balance-2"
        );
        mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsBytes(request)))
            .andExpect(status().isAccepted());

        mockMvc.perform(post("/v1/admin/projections:rebuild"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.submissionsScanned").value(1))
            .andExpect(jsonPath("$.projectionMessagesPublished").value(3));

        mockMvc.perform(get("/v1/players/player-rebuild-1/best"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.bestScores.seasonal.score").value(4100));
    }

    @Test
    void concurrentSubmissionsKeepHighestBestScore() throws Exception {
        var executor = Executors.newFixedThreadPool(6);
        try {
            var tasks = new ArrayList<Callable<Void>>();
            for (int index = 0; index < 6; index += 1) {
                final int score = 1000 + (index * 500);
                final int taskIndex = index;
                tasks.add(() -> {
                    leaderboardService.submitScore(new SubmitScoreRequest(
                        "sub-concurrent-" + taskIndex,
                        "player-concurrent",
                        "Concurrent",
                        score,
                        10000 + taskIndex,
                        Instant.parse("2026-04-09T17:00:0" + taskIndex + "Z"),
                        "2.4.3",
                        "balance-2"
                    ));
                    return null;
                });
            }

            executor.invokeAll(tasks);
            executor.shutdown();
            executor.awaitTermination(30, TimeUnit.SECONDS);

            mockMvc.perform(post("/v1/admin/projections:drain"))
                .andExpect(status().isOk());

            mockMvc.perform(get("/v1/players/player-concurrent/best"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bestScores.global.score").value(3500));
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void rateLimitUsesServerTimeNotClientPlayedAtBuckets() throws Exception {
        for (int index = 0; index < 24; index += 1) {
            var request = new SubmitScoreRequest(
                "sub-rate-" + index,
                "player-rate",
                "Rate",
                1000 + index,
                10000,
                Instant.parse("2026-04-09T10:" + String.format("%02d", index % 60) + ":00Z"),
                "2.4.3",
                "balance-2"
            );

            mockMvc.perform(post("/v1/scores:submit")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(request)))
                .andExpect(status().isAccepted());
        }

        var throttledRequest = new SubmitScoreRequest(
            "sub-rate-final",
            "player-rate",
            "Rate",
            2000,
            10000,
            Instant.parse("2025-01-01T00:00:00Z"),
            "2.4.3",
            "balance-2"
        );

        mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsBytes(throttledRequest)))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.quarantined").value(true))
            .andExpect(jsonPath("$.riskReasons[0]").value("rate-limit"));
    }

    @Test
    void rebuildPurgesQueueBeforeRepublishing() throws Exception {
        var current = new SubmitScoreRequest(
            "sub-replay-current",
            "player-replay",
            "Replay",
            5000,
            25000,
            Instant.parse("2026-04-09T19:00:00Z"),
            "2.4.3",
            "balance-2"
        );

        mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsBytes(current)))
            .andExpect(status().isAccepted());

        projectionQueueRepository.publish(new ProjectionTask(
            "old-replay-task",
            "player-replay",
            "Replay",
            ScopeKind.GLOBAL,
            "global",
            1500,
            9000,
            Instant.parse("2026-04-09T18:00:00Z")
        ));

        mockMvc.perform(post("/v1/admin/projections:rebuild"))
            .andExpect(status().isOk());

        mockMvc.perform(get("/v1/leaderboards/global"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].playerId").value("player-replay"))
            .andExpect(jsonPath("$.entries[0].score").value(5000));
    }
}
