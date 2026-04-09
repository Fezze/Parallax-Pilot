package com.parallaxpilot.leaderboard.api;

import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.parallaxpilot.leaderboard.api.dto.LeaderboardResponse;
import com.parallaxpilot.leaderboard.api.dto.PlayerBestScoresResponse;
import com.parallaxpilot.leaderboard.api.dto.RankClassificationResponse;
import com.parallaxpilot.leaderboard.api.dto.SubmitScoreRequest;
import com.parallaxpilot.leaderboard.api.dto.SubmitScoreResponse;
import com.parallaxpilot.leaderboard.service.LeaderboardService;
import jakarta.validation.Valid;

@RestController
@Validated
@RequestMapping("/v1")
public class LeaderboardController {

    private final LeaderboardService leaderboardService;

    public LeaderboardController(LeaderboardService leaderboardService) {
        this.leaderboardService = leaderboardService;
    }

    @PostMapping("/scores:submit")
    @ResponseStatus(HttpStatus.ACCEPTED)
    SubmitScoreResponse submit(@Valid @RequestBody SubmitScoreRequest request) {
        return leaderboardService.submitScore(request);
    }

    @GetMapping("/leaderboards/{scope}")
    LeaderboardResponse getLeaderboard(@PathVariable String scope, @RequestParam(defaultValue = "10") int limit) {
        return leaderboardService.getLeaderboard(scope, limit);
    }

    @GetMapping("/players/{playerId}/best")
    PlayerBestScoresResponse getBestScores(@PathVariable String playerId) {
        return leaderboardService.getPlayerBestScores(playerId);
    }

    @GetMapping("/rankings/classify")
    RankClassificationResponse classify(@RequestParam String playerId) {
        return leaderboardService.classify(playerId);
    }
}
