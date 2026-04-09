package com.parallaxpilot.leaderboard.api;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.parallaxpilot.leaderboard.api.dto.LeaderboardEntryResponse;
import com.parallaxpilot.leaderboard.api.dto.LeaderboardResponse;
import com.parallaxpilot.leaderboard.api.dto.PlayerBestScoresResponse;
import com.parallaxpilot.leaderboard.api.dto.RankClassificationResponse;
import com.parallaxpilot.leaderboard.api.dto.SubmitScoreRequest;
import com.parallaxpilot.leaderboard.api.dto.SubmitScoreResponse;
import com.parallaxpilot.leaderboard.service.LeaderboardService;

@WebMvcTest(LeaderboardController.class)
class LeaderboardControllerTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper().findAndRegisterModules();

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private LeaderboardService leaderboardService;

    @Test
    void submitsScore() throws Exception {
        var request = new SubmitScoreRequest(
            "sub-1",
            "player-1",
            "Pilot",
            1200,
            15000,
            Instant.parse("2026-04-09T12:00:00Z"),
            "2.4.1",
            "balance-2"
        );

        when(leaderboardService.submitScore(request))
            .thenReturn(new SubmitScoreResponse(true, false, true, new RankClassificationResponse("player-1", 4, null, "global")));

        mockMvc.perform(post("/v1/scores:submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content(OBJECT_MAPPER.writeValueAsBytes(request)))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.bestUpdated").value(true))
            .andExpect(jsonPath("$.classification.exactRank").value(4));
    }

    @Test
    void returnsLeaderboard() throws Exception {
        when(leaderboardService.getLeaderboard("global", 10))
            .thenReturn(new LeaderboardResponse(
                "global",
                "global",
                List.of(new LeaderboardEntryResponse("player-1", "Pilot", 1200, 15000, 1))
            ));

        mockMvc.perform(get("/v1/leaderboards/global"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].playerId").value("player-1"));
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
}
