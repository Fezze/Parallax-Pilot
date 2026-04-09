package com.parallaxpilot.leaderboard.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import com.parallaxpilot.leaderboard.api.dto.SubmitScoreRequest;
import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.domain.RiskSignals;
import com.parallaxpilot.leaderboard.domain.RiskSignalRecord;
import com.parallaxpilot.leaderboard.repository.DynamoDbJsonRepository;
import com.parallaxpilot.leaderboard.repository.LeaderboardTables;
import com.parallaxpilot.leaderboard.repository.RateLimitRepository;

@Service
public class AntiAbuseService {

    private final RateLimitRepository rateLimitRepository;
    private final DynamoDbJsonRepository repository;
    private final LeaderboardProperties properties;

    public AntiAbuseService(
        RateLimitRepository rateLimitRepository,
        DynamoDbJsonRepository repository,
        LeaderboardProperties properties
    ) {
        this.rateLimitRepository = rateLimitRepository;
        this.repository = repository;
        this.properties = properties;
    }

    public Assessment assess(SubmitScoreRequest request) {
        var reasons = new ArrayList<String>();
        var currentWindowCount = rateLimitRepository.incrementPlayerWindow(request.playerId(), Instant.now());

        if (currentWindowCount > properties.rateLimitPerMinute()) {
            reasons.add(RiskSignals.RATE_LIMIT);
        }
        if (request.score() > properties.quarantineScoreThreshold()) {
            reasons.add(RiskSignals.SCORE_OUTLIER);
        }
        if (request.survivedMs() > properties.quarantineSurvivedMs()) {
            reasons.add(RiskSignals.SURVIVAL_OUTLIER);
        }

        var quarantined = !reasons.isEmpty();
        persistSignals(request.submissionId(), request.playerId(), reasons, quarantined, Instant.now());
        return new Assessment(quarantined, List.copyOf(reasons));
    }

    private void persistSignals(
        String submissionId,
        String playerId,
        List<String> reasons,
        boolean quarantined,
        Instant createdAt
    ) {
        for (var reason : reasons) {
            var signal = new RiskSignalRecord(
                submissionId,
                playerId,
                reason,
                quarantined ? RiskSignals.SEVERITY_HIGH : RiskSignals.SEVERITY_MEDIUM,
                quarantined,
                createdAt
            );
            repository.put(LeaderboardTables.RISK_SIGNALS, submissionId, reason, signal);
        }
    }

    public record Assessment(boolean quarantined, List<String> reasons) {
    }
}
