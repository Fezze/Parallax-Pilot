package com.parallaxpilot.leaderboard.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
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

    private static final String ADMIN_TOKEN = "test-admin-token";

    private static Instant currentTestInstant(int minuteOffset) {
        return Instant.now()
            .minus(12, ChronoUnit.HOURS)
            .truncatedTo(ChronoUnit.MINUTES)
            .plus(minuteOffset, ChronoUnit.MINUTES);
    }

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
        var playedAt = currentTestInstant(0);
        var request = new SubmitScoreRequest(
            "sub-int-1",
            "player-int-1",
            "Pilot",
            2200,
            18000,
            playedAt,
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
            .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/v1/admin/projections:drain")
                .header("X-Admin-Token", ADMIN_TOKEN))
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
        var playedAt = currentTestInstant(10);
        var request = new SubmitScoreRequest(
            "sub-int-dup",
            "player-int-dup",
            "Comet",
            1700,
            14000,
            playedAt,
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
            .andExpect(jsonPath("$.bestUpdated").value(false))
            .andExpect(jsonPath("$.submittedRoundClassifications[0].availability").value("duplicate_submission"));
    }

    @Test
    void lowerScoreDoesNotReplaceExistingBestScore() throws Exception {
        var betterPlayedAt = currentTestInstant(20);
        var worsePlayedAt = currentTestInstant(25);
        var betterRequest = new SubmitScoreRequest(
            "sub-int-best-1",
            "player-int-best",
            "Nova",
            2600,
            21000,
            betterPlayedAt,
            "2.4.3",
            "balance-2"
        );
        var worseRequest = new SubmitScoreRequest(
            "sub-int-best-2",
            "player-int-best",
            "Nova",
            1200,
            10000,
            worsePlayedAt,
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
            .andExpect(jsonPath("$.bestUpdated").value(false))
            .andExpect(jsonPath("$.submittedRoundClassifications[0].classificationBasis").value("submitted_round"))
            .andExpect(jsonPath("$.submittedRoundClassifications[0].availability").value("estimated"));

        mockMvc.perform(get("/v1/players/player-int-best/best"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.bestScores.global.score").value(2600))
            .andExpect(jsonPath("$.bestScores.daily.score").value(2600))
            .andExpect(jsonPath("$.bestScores.seasonal.score").value(2600));
    }

    @Test
    void staleProjectionTaskDoesNotReintroduceOldLeaderboardEntry() throws Exception {
        var firstPlayedAt = currentTestInstant(30);
        var betterPlayedAt = currentTestInstant(35);
        var first = new SubmitScoreRequest(
            "sub-stale-1",
            "player-stale",
            "Stale",
            1800,
            12000,
            firstPlayedAt,
            "2.4.3",
            "balance-2"
        );
        var better = new SubmitScoreRequest(
            "sub-stale-2",
            "player-stale",
            "Stale",
            2600,
            18000,
            betterPlayedAt,
            "2.4.3",
            "balance-2"
        );

        mockMvc.perform(post("/v1/scores:submit").contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsBytes(first)))
            .andExpect(status().isAccepted());
        mockMvc.perform(post("/v1/scores:submit").contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsBytes(better)))
            .andExpect(status().isAccepted());
        mockMvc.perform(post("/v1/admin/projections:drain")
            .header("X-Admin-Token", ADMIN_TOKEN))
            .andExpect(status().isOk());

        projectionQueueRepository.publish(new ProjectionTask(
            "stale-task",
            "player-stale",
            "Stale",
            ScopeKind.GLOBAL,
            "global",
            1800,
            12000,
            firstPlayedAt
        ));

        mockMvc.perform(post("/v1/admin/projections:drain")
            .header("X-Admin-Token", ADMIN_TOKEN))
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
            var playedAt = currentTestInstant(60 + index);
            var request = new SubmitScoreRequest(
                "sub-around-" + index,
                "player-around-" + index,
                "Pilot-" + index,
                3000 - (index * 100),
                20000 - (index * 500L),
                playedAt,
                "2.4.3",
                "balance-2"
            );
            mockMvc.perform(post("/v1/scores:submit")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(request)))
                .andExpect(status().isAccepted());
        }

        mockMvc.perform(post("/v1/admin/projections:drain")
            .header("X-Admin-Token", ADMIN_TOKEN))
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
        var playedAt = currentTestInstant(90);
        var request = new SubmitScoreRequest(
            "sub-risk-1",
            "player-risk-1",
            "Risky",
            250000,
            18000,
            playedAt,
            "2.4.3",
            "balance-2"
        );

        mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsBytes(request)))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.suspicious").value(true))
            .andExpect(jsonPath("$.quarantined").value(true))
            .andExpect(jsonPath("$.submittedRoundClassifications[0].availability").value("quarantined_submission"));

        mockMvc.perform(post("/v1/admin/projections:drain")
                .header("X-Admin-Token", ADMIN_TOKEN))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.processedMessages").value(0));
    }

    @Test
    void seasonCutoverAndReplayRebuildProjections() throws Exception {
        var seasonStart = currentTestInstant(-720);
        mockMvc.perform(patch("/v1/admin/seasons:cutover")
            .header("X-Admin-Token", ADMIN_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsBytes(new SeasonCutoverRequest(
                    "current-test-season",
                    seasonStart
                ))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.seasonKey").value("current-test-season"));

        var playedAt = currentTestInstant(120);
        var request = new SubmitScoreRequest(
            "sub-rebuild-1",
            "player-rebuild-1",
            "Replay",
            4100,
            22000,
            playedAt,
            "2.4.3",
            "balance-2"
        );
        mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsBytes(request)))
            .andExpect(status().isAccepted());

        mockMvc.perform(post("/v1/admin/projections:rebuild")
            .header("X-Admin-Token", ADMIN_TOKEN))
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
                        currentTestInstant(180 + taskIndex),
                        "2.4.3",
                        "balance-2"
                    ));
                    return null;
                });
            }

            executor.invokeAll(tasks);
            executor.shutdown();
            executor.awaitTermination(30, TimeUnit.SECONDS);

                mockMvc.perform(post("/v1/admin/projections:drain")
                    .header("X-Admin-Token", ADMIN_TOKEN))
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
            var playedAt = currentTestInstant(240 + index);
            var request = new SubmitScoreRequest(
                "sub-rate-" + index,
                "player-rate",
                "Rate",
                1000 + index,
                10000,
                playedAt,
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
        var currentPlayedAt = currentTestInstant(300);
        var stalePlayedAt = currentTestInstant(240);
        var current = new SubmitScoreRequest(
            "sub-replay-current",
            "player-replay",
            "Replay",
            5000,
            25000,
            currentPlayedAt,
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
            stalePlayedAt
        ));

        mockMvc.perform(post("/v1/admin/projections:rebuild")
            .header("X-Admin-Token", ADMIN_TOKEN))
            .andExpect(status().isOk());

        mockMvc.perform(get("/v1/leaderboards/global"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].playerId").value("player-replay"))
            .andExpect(jsonPath("$.entries[0].score").value(5000));
    }

    @Test
    void leaderboardLimitIsClampedAndRankingUsesSurvivedMsTieBreak() throws Exception {
        var baseTime = currentTestInstant(360);
        var lowerSurvival = new SubmitScoreRequest(
            "sub-tie-01",
            "player-tie-1",
            "Pilot-1",
            2000,
            12000,
            baseTime,
            "2.4.3",
            "balance-2"
        );
        var higherSurvival = new SubmitScoreRequest(
            "sub-tie-02",
            "player-tie-2",
            "Pilot-2",
            2000,
            18000,
            baseTime.plus(1, ChronoUnit.MINUTES),
            "2.4.3",
            "balance-2"
        );

        mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsBytes(lowerSurvival)))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.submittedRoundClassifications[0].exactRank").value(1));

        mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsBytes(higherSurvival)))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.submittedRoundClassifications[0].exactRank").value(1));

        mockMvc.perform(post("/v1/admin/projections:drain")
                .header("X-Admin-Token", ADMIN_TOKEN))
            .andExpect(status().isOk());

        mockMvc.perform(get("/v1/leaderboards/global").param("limit", "9999"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].playerId").value("player-tie-2"));
    }

    @Test
    void rejectsFuturePlayedAtAtApiBoundary() throws Exception {
        var request = new SubmitScoreRequest(
            "sub-future-1",
            "player-future",
            "Future",
            1200,
            10000,
            Instant.now().plus(10, ChronoUnit.MINUTES),
            "2.4.3",
            "balance-2"
        );

        mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsBytes(request)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fieldErrors.playedAt").exists());
    }
}
