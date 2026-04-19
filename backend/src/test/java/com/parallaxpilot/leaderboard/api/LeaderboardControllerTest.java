package com.parallaxpilot.leaderboard.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
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
import com.parallaxpilot.leaderboard.domain.ScoreSubmission;
import com.parallaxpilot.leaderboard.service.LeaderboardService;
import com.parallaxpilot.leaderboard.service.SnapshotService;

@WebMvcTest(LeaderboardController.class)
@TestPropertySource(properties = {
    "app.admin.token=test-admin-token",
    "app.api.max-public-leaderboard-limit=100"
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

    @Test
    void submitsScore() throws Exception {
        var request = new SubmitScoreRequest(
            "sub-ctrl-1",
            "player-1",
            "Pilot",
            1200,
            15000,
            Instant.parse("2026-04-09T12:00:00Z"),
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
                    "estimated"
                ))
            ));

        mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content(OBJECT_MAPPER.writeValueAsBytes(request)))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.bestUpdated").value(true))
                .andExpect(jsonPath("$.classification.exactRank").value(4))
                .andExpect(jsonPath("$.submittedRoundClassifications[0].exactRank").value(4));
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
            .andExpect(jsonPath("$.entries[0].playerId").value("player-1"));
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
            .andExpect(jsonPath("$.error").value("Unauthorized"))
            .andExpect(jsonPath("$.message").value("Missing or invalid admin token"));
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
    void returnsInternalErrorPayloadForUnexpectedException() throws Exception {
        doThrow(new IllegalStateException("boom"))
            .when(leaderboardService)
            .getLeaderboard(any(), any(Integer.class));

        mockMvc.perform(get("/v1/leaderboards/global"))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.error").value("Internal Error"))
            .andExpect(jsonPath("$.message").value("boom"))
            .andExpect(jsonPath("$.path").value("/v1/leaderboards/global"));
    }
}
