package com.parallaxpilot.leaderboard.api;

import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.parallaxpilot.leaderboard.api.dto.AdminSnapshotResponse;
import com.parallaxpilot.leaderboard.api.dto.AdminSubmissionDebugResponse;
import com.parallaxpilot.leaderboard.api.dto.LeaderboardEntryResponse;
import com.parallaxpilot.leaderboard.api.dto.LeaderboardResponse;
import com.parallaxpilot.leaderboard.api.dto.PlayerBestScoresResponse;
import com.parallaxpilot.leaderboard.api.dto.RankClassificationResponse;
import com.parallaxpilot.leaderboard.api.dto.SeasonCutoverRequest;
import com.parallaxpilot.leaderboard.api.dto.SeasonMetadataResponse;
import com.parallaxpilot.leaderboard.api.dto.SubmittedRoundClassificationResponse;
import com.parallaxpilot.leaderboard.api.dto.SubmitScoreRequest;
import com.parallaxpilot.leaderboard.api.dto.SubmitScoreResponse;
import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.config.TimeConfig;
import com.parallaxpilot.leaderboard.domain.ScoreSubmission;
import com.parallaxpilot.leaderboard.service.LeaderboardService;
import com.parallaxpilot.leaderboard.service.SnapshotService;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

@WebMvcTest(LeaderboardController.class)
@Import(TimeConfig.class)
@EnableConfigurationProperties(LeaderboardProperties.class)
@TestPropertySource(properties = {
    "app.admin.token=test-admin-token",
    "app.api.max-public-leaderboard-limit=100",
    "app.leaderboard.max-submission-age-days=7"
})
class LeaderboardControllerTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper().findAndRegisterModules();
    private static final String ADMIN_TOKEN = "test-admin-token";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private LeaderboardService leaderboardService;

    @MockitoBean
    private SnapshotService snapshotService;

    @MockitoBean
    private MeterRegistry meterRegistry;

    @MockitoBean
    private Clock clock;

    @BeforeEach
    void stubMetrics() {
        when(clock.instant()).thenReturn(Instant.parse("2026-04-19T12:00:00Z"));
        when(clock.getZone()).thenReturn(java.time.ZoneOffset.UTC);
        when(meterRegistry.counter("leaderboard.admin.auth.failures", "reason", "missing_or_invalid_token"))
            .thenReturn(mock(Counter.class));
    }

    @Test
    void submitsScore() throws Exception {
        var request = new SubmitScoreRequest(
            "sub-ctrl-1",
            "player-1",
            "Pilot",
            1200,
            15000,
            Instant.parse("2026-04-19T11:55:00Z"),
            "2.4.1",
            "balance-2"
        );

        when(leaderboardService.submitScore(request))
            .thenReturn(new SubmitScoreResponse(
                true,
                false,
                true,
                false,
                false,
                List.of(),
                new RankClassificationResponse("player-1", 4, null, "global", 20),
                List.of(new SubmittedRoundClassificationResponse(
                    "global",
                    "global",
                    1200,
                    15000,
                    4,
                    null,
                    20,
                    "submitted_round",
                    "estimated_from_bounded_projection"
                ))
            ));

        mockMvc.perform(post("/v1/scores:submit")
                .header("X-Request-Id", "req-submit-1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(OBJECT_MAPPER.writeValueAsBytes(request)))
            .andExpect(status().isAccepted())
            .andExpect(header().string("X-Request-Id", "req-submit-1"))
            .andExpect(jsonPath("$.bestUpdated").value(true))
            .andExpect(jsonPath("$.classification.exactRank").value(4))
                .andExpect(jsonPath("$.submittedRoundClassifications[0].exactRank").value(4))
                .andExpect(jsonPath("$.submittedRoundClassifications[0].availability").value("estimated_from_bounded_projection"));
    }

    @Test
    void returnsLeaderboard() throws Exception {
        when(leaderboardService.getLeaderboard("global", 10))
            .thenReturn(new LeaderboardResponse(
                "global",
                "global",
                List.of(new LeaderboardEntryResponse("player-1", "Pilot", 1200, 15000, 1)),
                1
            ));

        mockMvc.perform(get("/v1/leaderboards/global"))
            .andExpect(status().isOk())
            .andExpect(header().exists("X-Request-Id"))
            .andExpect(jsonPath("$.entries[0].playerId").value("player-1"));
    }

    @Test
    void echoesValidRequestId() throws Exception {
        when(leaderboardService.getLeaderboard("global", 10))
            .thenReturn(new LeaderboardResponse("global", "global", List.of(), 0));

        mockMvc.perform(get("/v1/leaderboards/global").header("X-Request-Id", "req-abc-123"))
            .andExpect(status().isOk())
            .andExpect(header().string("X-Request-Id", "req-abc-123"));
    }

    @Test
    void replacesInvalidRequestId() throws Exception {
        when(leaderboardService.getLeaderboard("global", 10))
            .thenReturn(new LeaderboardResponse("global", "global", List.of(), 0));

        String invalidRequestId = "x".repeat(81);
        mockMvc.perform(get("/v1/leaderboards/global").header("X-Request-Id", invalidRequestId))
            .andExpect(status().isOk())
            .andExpect(header().exists("X-Request-Id"))
            .andExpect(result -> assertNotEquals(invalidRequestId, result.getResponse().getHeader("X-Request-Id")));
    }

    @Test
    void clampsLeaderboardLimitToConfiguredMaximum() throws Exception {
        when(leaderboardService.getLeaderboard("global", 100))
            .thenReturn(new LeaderboardResponse("global", "global", List.of(), 0));

        mockMvc.perform(get("/v1/leaderboards/global").param("limit", "9999"))
            .andExpect(status().isOk());

        verify(leaderboardService).getLeaderboard("global", 100);
    }

    @Test
    void normalizesNegativeLeaderboardLimitToOne() throws Exception {
        when(leaderboardService.getLeaderboard("global", 1))
            .thenReturn(new LeaderboardResponse("global", "global", List.of(), 0));

        mockMvc.perform(get("/v1/leaderboards/global").param("limit", "-5"))
            .andExpect(status().isOk());

        verify(leaderboardService).getLeaderboard("global", 1);
    }

    @Test
    void normalizesZeroLeaderboardLimitToOne() throws Exception {
        when(leaderboardService.getLeaderboard("global", 1))
            .thenReturn(new LeaderboardResponse("global", "global", List.of(), 0));

        mockMvc.perform(get("/v1/leaderboards/global").param("limit", "0"))
            .andExpect(status().isOk());

        verify(leaderboardService).getLeaderboard("global", 1);
    }

    @Test
    void returnsBestScores() throws Exception {
        when(leaderboardService.getPlayerBestScores("player-1"))
            .thenReturn(new PlayerBestScoresResponse(
                "player-1",
                Map.of("global", new PlayerBestScoresResponse.ScoreView(1200, 15000, "2026-04-09T12:00:00Z"))
            ));

        mockMvc.perform(get("/v1/players/player-1/best"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.bestScores.global.score").value(1200));
    }

    @Test
    void returnsAroundMeLeaderboard() throws Exception {
        when(leaderboardService.getAroundMe("global", "player-1"))
            .thenReturn(new LeaderboardResponse(
                "global",
                "global",
                List.of(new LeaderboardEntryResponse("player-1", "Pilot", 1200, 15000, 4)),
                20
            ));

        mockMvc.perform(get("/v1/leaderboards/global/around-me").param("playerId", "player-1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].rank").value(4));
    }

    @Test
    void cutsOverSeason() throws Exception {
        var request = new SeasonCutoverRequest("2026-S2", Instant.parse("2026-07-01T00:00:00Z"));
        when(leaderboardService.cutoverSeason(request))
            .thenReturn(new SeasonMetadataResponse("2026-S2", Instant.parse("2026-07-01T00:00:00Z"), null, true));

        mockMvc.perform(patch("/v1/admin/seasons:cutover")
                .header("X-Admin-Token", ADMIN_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(OBJECT_MAPPER.writeValueAsBytes(request)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.seasonKey").value("2026-S2"));
    }

    @Test
    void exportsSnapshot() throws Exception {
        when(snapshotService.exportSnapshot())
            .thenReturn(new AdminSnapshotResponse("pp-leaderboard-snapshots", "leaderboard-snapshots/test.json", 1, 2, 3, 4));

        mockMvc.perform(post("/v1/admin/snapshots:export")
                .header("X-Admin-Token", ADMIN_TOKEN))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.snapshotKey").value("leaderboard-snapshots/test.json"))
            .andExpect(jsonPath("$.riskSignals").value(4));
    }

    @Test
    void returnsSubmissionDebug() throws Exception {
        var submission = new ScoreSubmission(
            "sub-debug",
            "player-debug",
            "Debug",
            1500,
            12000,
            Instant.parse("2026-04-09T12:00:00Z"),
            "2.4.5",
            "balance-2",
            false,
            false,
            List.of()
        );
        when(leaderboardService.getSubmissionDebug("sub-debug"))
            .thenReturn(new AdminSubmissionDebugResponse(
                submission,
                List.of(),
                new PlayerBestScoresResponse("player-debug", Map.of()),
                new RankClassificationResponse("player-debug", null, "unranked", "global", 0)
            ));

        mockMvc.perform(get("/v1/admin/submissions/sub-debug/debug")
                .header("X-Admin-Token", ADMIN_TOKEN))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.submission.submissionId").value("sub-debug"));
    }

    @Test
    void rejectsAdminCallsWithoutToken() throws Exception {
        mockMvc.perform(post("/v1/admin/snapshots:export"))
            .andExpect(status().isUnauthorized())
            .andExpect(header().exists("X-Request-Id"))
            .andExpect(jsonPath("$.error").value("Unauthorized"))
            .andExpect(jsonPath("$.message").value("Missing or invalid admin token"));
    }

    @Test
    void rejectsAdminCallsWithWrongToken() throws Exception {
        mockMvc.perform(post("/v1/admin/snapshots:export")
                .header("X-Admin-Token", "wrong-token"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("Unauthorized"));
    }

    @Test
    void returnsValidationErrorPayloadForInvalidSubmit() throws Exception {
        mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "submissionId": "",
                      "playerId": "",
                      "score": 0,
                      "survivedMs": 0,
                      "playedAt": null,
                      "clientVersion": ""
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("Validation Failed"))
            .andExpect(jsonPath("$.path").value("/v1/scores:submit"))
            .andExpect(jsonPath("$.fieldErrors.submissionId").exists())
            .andExpect(jsonPath("$.fieldErrors.playerId").exists())
            .andExpect(jsonPath("$.fieldErrors.score").exists())
            .andExpect(jsonPath("$.fieldErrors.survivedMs").exists())
            .andExpect(jsonPath("$.fieldErrors.playedAt").exists())
            .andExpect(jsonPath("$.fieldErrors.clientVersion").exists());
    }

    @Test
    void rejectsFuturePlayedAtAndInvalidCharacters() throws Exception {
        mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "submissionId": "sub bad",
                      "playerId": "player-1",
                                            "nickname": "Pilot\\u0001",
                      "score": 10,
                      "survivedMs": 1000,
                      "playedAt": "2999-01-01T00:00:00Z",
                      "clientVersion": "2.4.1",
                      "deviceModel": "watch"
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fieldErrors.submissionId").exists())
            .andExpect(jsonPath("$.fieldErrors.playedAt").exists());
    }

            @Test
            void rejectsTooOldPlayedAt() throws Exception {
            mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "submissionId": "sub-old-01",
                      "playerId": "player-1",
                      "nickname": "Pilot",
                      "score": 10,
                      "survivedMs": 1000,
                      "playedAt": "2020-01-01T00:00:00Z",
                      "clientVersion": "2.4.1",
                      "deviceModel": "watch"
                    }
                    """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.playedAt").exists());
            }

    @Test
    void rejectsInvalidScope() throws Exception {
        mockMvc.perform(get("/v1/leaderboards/monthly"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("Validation Failed"));
    }

    @Test
    void rejectsInvalidPlayerIdInBestScoresPath() throws Exception {
        mockMvc.perform(get("/v1/players/bad!/best"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("Validation Failed"));
    }

    @Test
    void rejectsInvalidPlayerIdInAroundMeQuery() throws Exception {
        mockMvc.perform(get("/v1/leaderboards/global/around-me").param("playerId", "bad!"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("Validation Failed"));
    }

    @Test
    void rejectsInvalidPlayerIdInClassifyQuery() throws Exception {
        mockMvc.perform(get("/v1/rankings/classify").param("playerId", "bad!"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("Validation Failed"));
    }

    @Test
    void returnsInternalErrorPayloadForUnexpectedException() throws Exception {
        doThrow(new IllegalStateException("boom"))
            .when(leaderboardService)
            .getLeaderboard(any(), any(Integer.class));

        mockMvc.perform(get("/v1/leaderboards/global"))
            .andExpect(status().isInternalServerError())
            .andExpect(header().exists("X-Request-Id"))
            .andExpect(jsonPath("$.error").value("Internal Error"))
            .andExpect(jsonPath("$.message").value("Unexpected server error"))
            .andExpect(jsonPath("$.path").value("/v1/leaderboards/global"));
    }
}
