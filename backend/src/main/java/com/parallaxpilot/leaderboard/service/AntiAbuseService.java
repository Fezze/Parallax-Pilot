package com.parallaxpilot.leaderboard.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import com.parallaxpilot.leaderboard.api.dto.SubmitScoreRequest;
import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.domain.RiskSignalRecord;
import com.parallaxpilot.leaderboard.repository.DynamoDbJsonRepository;
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
        var currentWindowCount = rateLimitRepository.incrementPlayerWindow(request.playerId(), request.playedAt());

        if (currentWindowCount > properties.rateLimitPerMinute()) {
            reasons.add("rate-limit");
        }
        if (request.score() > properties.quarantineScoreThreshold()) {
            reasons.add("score-outlier");
        }
        if (request.survivedMs() > properties.quarantineSurvivedMs()) {
            reasons.add("survival-outlier");
        }

        var quarantined = !reasons.isEmpty();
        persistSignals(request.submissionId(), request.playerId(), reasons, quarantined, request.playedAt());
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
                quarantined ? "high" : "medium",
                quarantined,
                createdAt
            );
            repository.put("risk_signals", submissionId, reason, signal);
        }
    }

    public record Assessment(boolean quarantined, List<String> reasons) {
    }
}
