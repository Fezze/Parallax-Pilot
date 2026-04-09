package com.parallaxpilot.leaderboard.service;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;

import org.springframework.stereotype.Service;

import com.parallaxpilot.leaderboard.api.dto.LeaderboardEntryResponse;
import com.parallaxpilot.leaderboard.api.dto.LeaderboardResponse;
import com.parallaxpilot.leaderboard.api.dto.PlayerBestScoresResponse;
import com.parallaxpilot.leaderboard.api.dto.RankClassificationResponse;
import com.parallaxpilot.leaderboard.api.dto.SubmitScoreRequest;
import com.parallaxpilot.leaderboard.api.dto.SubmitScoreResponse;
import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.domain.BestScoreRecord;
import com.parallaxpilot.leaderboard.domain.LeaderboardEntry;
import com.parallaxpilot.leaderboard.domain.ScopeKind;
import com.parallaxpilot.leaderboard.domain.ScopeResolver;
import com.parallaxpilot.leaderboard.domain.ScoreSubmission;
import com.parallaxpilot.leaderboard.repository.BestScoreRepository;
import com.parallaxpilot.leaderboard.repository.DynamoDbJsonRepository;
import com.parallaxpilot.leaderboard.repository.IdempotencyRepository;

@Service
public class LeaderboardService {

    private static final Comparator<LeaderboardEntry> LEADERBOARD_ORDER = Comparator
        .comparingInt(LeaderboardEntry::score).reversed()
        .thenComparing(LeaderboardEntry::playedAt)
        .thenComparing(LeaderboardEntry::playerId);

    private final DynamoDbJsonRepository repository;
    private final BestScoreRepository bestScoreRepository;
    private final IdempotencyRepository idempotencyRepository;
    private final ScopeResolver scopeResolver;
    private final LeaderboardProperties properties;

    public LeaderboardService(
        DynamoDbJsonRepository repository,
        BestScoreRepository bestScoreRepository,
        IdempotencyRepository idempotencyRepository,
        ScopeResolver scopeResolver,
        LeaderboardProperties properties
    ) {
        this.repository = repository;
        this.bestScoreRepository = bestScoreRepository;
        this.idempotencyRepository = idempotencyRepository;
        this.scopeResolver = scopeResolver;
        this.properties = properties;
    }

    public SubmitScoreResponse submitScore(SubmitScoreRequest request) {
        if (!idempotencyRepository.acquire(request.submissionId(), request.playedAt())) {
            return new SubmitScoreResponse(true, true, false, classify(request.playerId()));
        }

        var submission = new ScoreSubmission(
            request.submissionId(),
            request.playerId(),
            request.nickname(),
            request.score(),
            request.survivedMs(),
            request.playedAt(),
            request.clientVersion(),
            request.deviceModel()
        );
        repository.put("score_submissions", "submission", request.submissionId(), submission);

        boolean bestUpdated = false;
        for (var scope : scopeResolver.resolve(request.playedAt())) {
            var best = new BestScoreRecord(
                request.playerId(),
                request.nickname(),
                scope.scopeKind(),
                scope.scopeKey(),
                request.score(),
                request.survivedMs(),
                request.playedAt()
            );

            if (bestScoreRepository.putIfBetter(best)) {
                repository.put(
                    "leaderboard_entries",
                    scope.scopeKind().name() + "#" + scope.scopeKey(),
                    leaderboardSortKey(best),
                    new LeaderboardEntry(
                        best.playerId(),
                        best.nickname(),
                        best.scopeKind(),
                        best.scopeKey(),
                        best.score(),
                        best.survivedMs(),
                        best.playedAt()
                    )
                );
                bestUpdated = true;
            }
        }

        return new SubmitScoreResponse(true, false, bestUpdated, classify(request.playerId()));
    }

    public LeaderboardResponse getLeaderboard(String scope, int limit) {
        var scopeKind = scopeKind(scope);
        var scopeKey = activeScopeKey(scopeKind);
        var entries = repository
            .queryByPartitionKey(
                "leaderboard_entries",
                scopeKind.name() + "#" + scopeKey,
                LeaderboardEntry.class,
                limit * 3
            )
            .stream()
            .sorted(LEADERBOARD_ORDER)
            .collect(
                LinkedHashMap<String, LeaderboardEntry>::new,
                (map, entry) -> map.putIfAbsent(entry.playerId(), entry),
                LinkedHashMap::putAll
            )
            .values()
            .stream()
            .limit(limit)
            .toList();

        var ranked = new java.util.ArrayList<LeaderboardEntryResponse>();
        for (int index = 0; index < entries.size(); index += 1) {
            var entry = entries.get(index);
            ranked.add(new LeaderboardEntryResponse(
                entry.playerId(),
                entry.nickname(),
                entry.score(),
                entry.survivedMs(),
                index + 1
            ));
        }

        return new LeaderboardResponse(scope, scopeKey, ranked);
    }

    public PlayerBestScoresResponse getPlayerBestScores(String playerId) {
        var bestScores = new LinkedHashMap<String, PlayerBestScoresResponse.ScoreView>();
        for (var scopeKind : ScopeKind.values()) {
            var scopeKey = activeScopeKey(scopeKind);
            repository
                .get("best_scores", playerId, scopeKind.name() + "#" + scopeKey, BestScoreRecord.class)
                .ifPresent(best -> bestScores.put(
                    scopeKind.name().toLowerCase(),
                    new PlayerBestScoresResponse.ScoreView(
                        best.score(),
                        best.survivedMs(),
                        DateTimeFormatter.ISO_INSTANT.format(best.playedAt())
                    )
                ));
        }

        return new PlayerBestScoresResponse(playerId, bestScores);
    }

    public RankClassificationResponse classify(String playerId) {
        for (var scope : List.of("global", "daily", "seasonal")) {
            var leaderboard = getLeaderboard(scope, properties.exactRankThreshold());
            var exact = leaderboard.entries().stream()
                .filter(entry -> entry.playerId().equals(playerId))
                .map(LeaderboardEntryResponse::rank)
                .findFirst();

            if (exact.isPresent()) {
                return new RankClassificationResponse(playerId, exact.get(), null, scope);
            }
        }

        return new RankClassificationResponse(playerId, null, "top-25%", "global");
    }

    private ScopeKind scopeKind(String scope) {
        return switch (scope.toLowerCase()) {
            case "global" -> ScopeKind.GLOBAL;
            case "daily" -> ScopeKind.DAILY;
            case "seasonal" -> ScopeKind.SEASONAL;
            default -> throw new IllegalArgumentException("Unsupported scope: " + scope);
        };
    }

    private String activeScopeKey(ScopeKind scopeKind) {
        return scopeResolver.resolve(Instant.now()).stream()
            .filter(scope -> scope.scopeKind() == scopeKind)
            .findFirst()
            .map(com.parallaxpilot.leaderboard.domain.ScopeKey::scopeKey)
            .orElseThrow();
    }

    private String leaderboardSortKey(BestScoreRecord record) {
        long inverseScore = Integer.MAX_VALUE - record.score();
        long epochMillis = record.playedAt().toEpochMilli();
        return "%010d#%013d#%s".formatted(inverseScore, epochMillis, record.playerId());
    }
}
