package com.parallaxpilot.leaderboard.api;

import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.parallaxpilot.leaderboard.api.dto.AdminDrainResponse;
import com.parallaxpilot.leaderboard.api.dto.AdminReplayResponse;
import com.parallaxpilot.leaderboard.api.dto.AdminSnapshotResponse;
import com.parallaxpilot.leaderboard.api.dto.AdminSubmissionDebugResponse;
import com.parallaxpilot.leaderboard.api.dto.LeaderboardResponse;
import com.parallaxpilot.leaderboard.api.dto.PlayerBestScoresResponse;
import com.parallaxpilot.leaderboard.api.dto.RankClassificationResponse;
import com.parallaxpilot.leaderboard.api.dto.SeasonCutoverRequest;
import com.parallaxpilot.leaderboard.api.dto.SeasonMetadataResponse;
import com.parallaxpilot.leaderboard.api.dto.SubmitScoreRequest;
import com.parallaxpilot.leaderboard.api.dto.SubmitScoreResponse;
import com.parallaxpilot.leaderboard.service.LeaderboardService;
import com.parallaxpilot.leaderboard.service.SnapshotService;
import jakarta.validation.Valid;

@RestController
@Validated
@RequestMapping("/v1")
public class LeaderboardController {

    private final LeaderboardService leaderboardService;
    private final SnapshotService snapshotService;

    public LeaderboardController(LeaderboardService leaderboardService, SnapshotService snapshotService) {
        this.leaderboardService = leaderboardService;
        this.snapshotService = snapshotService;
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

    @GetMapping("/leaderboards/{scope}/around-me")
    LeaderboardResponse getLeaderboardAroundMe(
        @PathVariable String scope,
        @RequestParam String playerId
    ) {
        return leaderboardService.getAroundMe(scope, playerId);
    }

    @GetMapping("/players/{playerId}/best")
    PlayerBestScoresResponse getBestScores(@PathVariable String playerId) {
        return leaderboardService.getPlayerBestScores(playerId);
    }

    @GetMapping("/rankings/classify")
    RankClassificationResponse classify(@RequestParam String playerId) {
        return leaderboardService.classify(playerId);
    }

    @PostMapping("/admin/projections:drain")
    AdminDrainResponse drainProjectionQueue() {
        return leaderboardService.drainProjectionQueue();
    }

    @PostMapping("/admin/projections:rebuild")
    AdminReplayResponse rebuildProjections() {
        return leaderboardService.rebuildProjections();
    }

    @PostMapping("/admin/snapshots:export")
    AdminSnapshotResponse exportSnapshot() {
        return snapshotService.exportSnapshot();
    }

    @GetMapping("/admin/submissions/{submissionId}/debug")
    AdminSubmissionDebugResponse getSubmissionDebug(@PathVariable String submissionId) {
        return leaderboardService.getSubmissionDebug(submissionId);
    }

    @GetMapping("/admin/seasons/active")
    SeasonMetadataResponse getActiveSeason() {
        return leaderboardService.getActiveSeason();
    }

    @PatchMapping("/admin/seasons:cutover")
    SeasonMetadataResponse cutoverSeason(@Valid @RequestBody SeasonCutoverRequest request) {
        return leaderboardService.cutoverSeason(request);
    }
}
