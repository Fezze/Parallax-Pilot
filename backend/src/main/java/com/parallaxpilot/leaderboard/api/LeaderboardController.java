package com.parallaxpilot.leaderboard.api;

import org.springframework.beans.factory.annotation.Value;
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
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@RestController
@Validated
@RequestMapping("/v1")
public class LeaderboardController {

    private static final String PLAYER_ID_PATTERN = "^[A-Za-z0-9-]+$";
    private static final String SCOPE_PATTERN = "^(global|daily|seasonal)$";

    private final LeaderboardService leaderboardService;
    private final SnapshotService snapshotService;
    private final int maxPublicLeaderboardLimit;

    public LeaderboardController(
        LeaderboardService leaderboardService,
        SnapshotService snapshotService,
        @Value("${app.api.max-public-leaderboard-limit:100}") int maxPublicLeaderboardLimit
    ) {
        this.leaderboardService = leaderboardService;
        this.snapshotService = snapshotService;
        this.maxPublicLeaderboardLimit = maxPublicLeaderboardLimit;
    }

    @PostMapping("/scores:submit")
    @ResponseStatus(HttpStatus.ACCEPTED)
    SubmitScoreResponse submit(@Valid @RequestBody SubmitScoreRequest request) {
        return leaderboardService.submitScore(request);
    }

    @GetMapping("/leaderboards/{scope}")
    LeaderboardResponse getLeaderboard(
        @PathVariable @Pattern(regexp = SCOPE_PATTERN, flags = Pattern.Flag.CASE_INSENSITIVE) String scope,
        @RequestParam(defaultValue = "10") int limit
    ) {
        int normalizedLimit = Math.max(1, Math.min(limit, maxPublicLeaderboardLimit));
        return leaderboardService.getLeaderboard(scope, normalizedLimit);
    }

    @GetMapping("/leaderboards/{scope}/around-me")
    LeaderboardResponse getLeaderboardAroundMe(
        @PathVariable @Pattern(regexp = SCOPE_PATTERN, flags = Pattern.Flag.CASE_INSENSITIVE) String scope,
        @RequestParam @Size(min = 6, max = 64) @Pattern(regexp = PLAYER_ID_PATTERN) String playerId
    ) {
        return leaderboardService.getAroundMe(scope, playerId);
    }

    @GetMapping("/players/{playerId}/best")
    PlayerBestScoresResponse getBestScores(
        @PathVariable @Size(min = 6, max = 64) @Pattern(regexp = PLAYER_ID_PATTERN) String playerId
    ) {
        return leaderboardService.getPlayerBestScores(playerId);
    }

    @GetMapping("/rankings/classify")
    RankClassificationResponse classify(
        @RequestParam @Size(min = 6, max = 64) @Pattern(regexp = PLAYER_ID_PATTERN) String playerId
    ) {
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
