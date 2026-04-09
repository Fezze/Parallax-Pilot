package com.parallaxpilot.leaderboard.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.parallaxpilot.leaderboard.api.dto.SubmitScoreRequest;
import com.parallaxpilot.leaderboard.support.LocalStackIntegrationSupport;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LeaderboardIntegrationTest extends LocalStackIntegrationSupport {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeAll
    static void bootstrap() {
        bootstrapResources();
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
}
