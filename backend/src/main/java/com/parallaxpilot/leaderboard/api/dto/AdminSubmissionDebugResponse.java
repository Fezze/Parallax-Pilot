package com.parallaxpilot.leaderboard.api.dto;

import java.util.List;

import com.parallaxpilot.leaderboard.domain.RiskSignalRecord;
import com.parallaxpilot.leaderboard.domain.ScoreSubmission;

public record AdminSubmissionDebugResponse(
    ScoreSubmission submission,
    List<RiskSignalRecord> riskSignals,
    PlayerBestScoresResponse bestScores,
    RankClassificationResponse classification
) {
}
