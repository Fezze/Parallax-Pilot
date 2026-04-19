package com.parallaxpilot.leaderboard.service;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;

import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.parallaxpilot.leaderboard.api.dto.AdminDrainResponse;
import com.parallaxpilot.leaderboard.api.dto.AdminReplayResponse;
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
import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.domain.BestScoreRecord;
import com.parallaxpilot.leaderboard.domain.LeaderboardKeys;
import com.parallaxpilot.leaderboard.domain.LeaderboardEntry;
import com.parallaxpilot.leaderboard.domain.LeaderboardRanking;
import com.parallaxpilot.leaderboard.domain.ProjectionTask;
import com.parallaxpilot.leaderboard.domain.RankingBands;
import com.parallaxpilot.leaderboard.domain.ScopeKind;
import com.parallaxpilot.leaderboard.domain.ScopeKey;
import com.parallaxpilot.leaderboard.domain.ScopeResolver;
import com.parallaxpilot.leaderboard.domain.ScoreSubmission;
import com.parallaxpilot.leaderboard.repository.BestScoreRepository;
import com.parallaxpilot.leaderboard.repository.IdempotencyRepository;
import com.parallaxpilot.leaderboard.repository.LeaderboardEntryRepository;
import com.parallaxpilot.leaderboard.repository.ProjectionIndexRepository;
import com.parallaxpilot.leaderboard.repository.ProjectionProcessedRepository;
import com.parallaxpilot.leaderboard.repository.ProjectionQueueRepository;
import com.parallaxpilot.leaderboard.repository.RebuildLockRepository;
import com.parallaxpilot.leaderboard.repository.RiskSignalRepository;
import com.parallaxpilot.leaderboard.repository.ScoreSubmissionRepository;

@Service
public class LeaderboardService {
    private static final Logger LOG = LoggerFactory.getLogger(LeaderboardService.class);
    private static final String REBUILD_IN_PROGRESS = "Leaderboard rebuild in progress";
    private static final String REBUILD_ALREADY_IN_PROGRESS = "Leaderboard rebuild already in progress";

    private static final String CLASSIFICATION_BASIS_SUBMITTED_ROUND = "submitted_round";
    private static final String CLASSIFICATION_AVAILABILITY_ESTIMATED = "estimated";
    private static final String CLASSIFICATION_AVAILABILITY_DUPLICATE = "duplicate_submission";
    private static final String CLASSIFICATION_AVAILABILITY_QUARANTINED = "quarantined_submission";

    private final BestScoreRepository bestScoreRepository;
    private final IdempotencyRepository idempotencyRepository;
    private final ProjectionQueueRepository projectionQueueRepository;
    private final ProjectionService projectionService;
    private final ScopeResolver scopeResolver;
    private final AntiAbuseService antiAbuseService;
    private final SeasonService seasonService;
    private final RebuildLockRepository rebuildLockRepository;
    private final ScoreSubmissionRepository submissionRepository;
    private final LeaderboardEntryRepository leaderboardEntryRepository;
    private final ProjectionIndexRepository projectionIndexRepository;
    private final ProjectionProcessedRepository projectionProcessedRepository;
    private final RiskSignalRepository riskSignalRepository;
    private final LeaderboardProperties properties;
    private final MeterRegistry meterRegistry;

    public LeaderboardService(
        BestScoreRepository bestScoreRepository,
        IdempotencyRepository idempotencyRepository,
        ProjectionQueueRepository projectionQueueRepository,
        ProjectionService projectionService,
        ScopeResolver scopeResolver,
        AntiAbuseService antiAbuseService,
        SeasonService seasonService,
        RebuildLockRepository rebuildLockRepository,
        ScoreSubmissionRepository submissionRepository,
        LeaderboardEntryRepository leaderboardEntryRepository,
        ProjectionIndexRepository projectionIndexRepository,
        ProjectionProcessedRepository projectionProcessedRepository,
        RiskSignalRepository riskSignalRepository,
        LeaderboardProperties properties,
        MeterRegistry meterRegistry
    ) {
        this.bestScoreRepository = bestScoreRepository;
        this.idempotencyRepository = idempotencyRepository;
        this.projectionQueueRepository = projectionQueueRepository;
        this.projectionService = projectionService;
        this.scopeResolver = scopeResolver;
        this.antiAbuseService = antiAbuseService;
        this.seasonService = seasonService;
        this.rebuildLockRepository = rebuildLockRepository;
        this.submissionRepository = submissionRepository;
        this.leaderboardEntryRepository = leaderboardEntryRepository;
        this.projectionIndexRepository = projectionIndexRepository;
        this.projectionProcessedRepository = projectionProcessedRepository;
        this.riskSignalRepository = riskSignalRepository;
        this.properties = properties;
        this.meterRegistry = meterRegistry;
    }

    public SubmitScoreResponse submitScore(SubmitScoreRequest request) {
        if (rebuildLockRepository.isActive()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, REBUILD_IN_PROGRESS);
        }
        if (!idempotencyRepository.acquire(request.submissionId(), request.playedAt())) {
            meterRegistry.counter("leaderboard.submissions", "outcome", "duplicate").increment();
            return new SubmitScoreResponse(
                true,
                true,
                false,
                false,
                false,
                List.of(),
                classify(request.playerId()),
                unavailableSubmittedRoundClassifications(request, CLASSIFICATION_AVAILABILITY_DUPLICATE)
            );
        }

        var assessment = antiAbuseService.assess(request);
        var submission = new ScoreSubmission(
            request.submissionId(),
            request.playerId(),
            request.nickname(),
            request.score(),
            request.survivedMs(),
            request.playedAt(),
            request.clientVersion(),
            request.deviceModel(),
            !assessment.reasons().isEmpty(),
            assessment.quarantined(),
            assessment.reasons()
        );
        submissionRepository.put(submission);

        if (assessment.quarantined()) {
            idempotencyRepository.complete(request.submissionId());
            meterRegistry.counter("leaderboard.submissions", "outcome", "quarantined").increment();
            LOG.info(
                "score_submit submissionId={} playerId={} outcome=quarantined reasons={}",
                request.submissionId(),
                request.playerId(),
                assessment.reasons()
            );
            return new SubmitScoreResponse(
                true,
                false,
                false,
                true,
                true,
                assessment.reasons(),
                classify(request.playerId()),
                unavailableSubmittedRoundClassifications(request, CLASSIFICATION_AVAILABILITY_QUARANTINED)
            );
        }

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
                projectionQueueRepository.publish(new ProjectionTask(
                    request.submissionId(),
                    request.playerId(),
                    request.nickname(),
                    scope.scopeKind(),
                    scope.scopeKey(),
                    request.score(),
                    request.survivedMs(),
                    request.playedAt()
                ));
                bestUpdated = true;
            }
        }

        // finalize idempotency after successful processing
        idempotencyRepository.complete(request.submissionId());
        meterRegistry.counter("leaderboard.submissions", "outcome", "accepted").increment();
        LOG.info(
            "score_submit submissionId={} playerId={} outcome=accepted bestUpdated={}",
            request.submissionId(),
            request.playerId(),
            bestUpdated
        );

        return new SubmitScoreResponse(
            true,
            false,
            bestUpdated,
            false,
            false,
            List.of(),
            classify(request.playerId()),
            classifySubmittedRound(request)
        );
    }

    public LeaderboardResponse getLeaderboard(String scope, int limit) {
        var scopeKind = scopeKind(scope);
        var scopeKey = activeScopeKey(scopeKind);
        var ranked = rankEntries(scopeKind, scopeKey);

        return new LeaderboardResponse(
            scope,
            scopeKey,
            ranked.stream().limit(limit).toList(),
            ranked.size()
        );
    }

    public LeaderboardResponse getAroundMe(String scope, String playerId) {
        var scopeKind = scopeKind(scope);
        var scopeKey = activeScopeKey(scopeKind);
        var ranked = rankEntries(scopeKind, scopeKey);
        var playerIndex = indexOfPlayer(ranked, playerId);

        if (playerIndex < 0) {
            return new LeaderboardResponse(scope, scopeKey, List.of(), ranked.size());
        }

        var from = Math.max(0, playerIndex - properties.aroundMeWindow());
        var to = Math.min(ranked.size(), playerIndex + properties.aroundMeWindow() + 1);
        return new LeaderboardResponse(scope, scopeKey, ranked.subList(from, to), ranked.size());
    }

    public PlayerBestScoresResponse getPlayerBestScores(String playerId) {
        var bestScores = new LinkedHashMap<String, PlayerBestScoresResponse.ScoreView>();
        for (var scopeKind : ScopeKind.values()) {
            var scopeKey = activeScopeKey(scopeKind);
            bestScoreRepository
                .get(playerId, scopeKind, scopeKey)
                .ifPresent(best -> bestScores.put(
                    scopeKind.apiValue(),
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
        for (var scopeKind : ScopeKind.values()) {
            var scopeKey = activeScopeKey(scopeKind);
            var ranked = rankEntries(scopeKind, scopeKey);
            var playerIndex = indexOfPlayer(ranked, playerId);

            if (playerIndex >= 0) {
                var rank = playerIndex + 1;
                if (rank <= properties.exactRankThreshold()) {
                    return new RankClassificationResponse(playerId, rank, null, scopeKind.apiValue(), ranked.size());
                }
                return new RankClassificationResponse(
                    playerId,
                    null,
                    approximateBand(rank, ranked.size()),
                    scopeKind.apiValue(),
                    ranked.size()
                );
            }
        }

        return new RankClassificationResponse(playerId, null, RankingBands.UNRANKED, ScopeKind.GLOBAL.apiValue(), 0);
    }

    public AdminDrainResponse drainProjectionQueue() {
        return new AdminDrainResponse(projectionService.drainProjectionQueueFully());
    }

    public AdminReplayResponse rebuildProjections() {
        if (!rebuildLockRepository.tryAcquire()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, REBUILD_ALREADY_IN_PROGRESS);
        }
        var submissions = submissionRepository.scanAll().stream()
            .sorted(Comparator.comparing(ScoreSubmission::playedAt))
            .toList();

        try {
            bestScoreRepository.clearTable();
            leaderboardEntryRepository.clearTable();
            projectionIndexRepository.clearTable();
            projectionProcessedRepository.clearTable();
            projectionQueueRepository.purge();

            int bestUpdatesApplied = 0;
            int projectionMessages = 0;
            for (var submission : submissions) {
                if (submission.quarantined()) {
                    continue;
                }
                for (var scope : scopeResolver.resolve(submission.playedAt())) {
                    var best = new BestScoreRecord(
                        submission.playerId(),
                        submission.nickname(),
                        scope.scopeKind(),
                        scope.scopeKey(),
                        submission.score(),
                        submission.survivedMs(),
                        submission.playedAt()
                    );
                    if (bestScoreRepository.putIfBetter(best)) {
                        bestUpdatesApplied += 1;
                        projectionQueueRepository.publish(new ProjectionTask(
                            submission.submissionId(),
                            submission.playerId(),
                            submission.nickname(),
                            scope.scopeKind(),
                            scope.scopeKey(),
                            submission.score(),
                            submission.survivedMs(),
                            submission.playedAt()
                        ));
                        projectionMessages += 1;
                    }
                }
            }

            projectionService.drainProjectionQueueFully();
            meterRegistry.counter("leaderboard.projections.rebuilt").increment();
            return new AdminReplayResponse(submissions.size(), bestUpdatesApplied, projectionMessages);
        } finally {
            rebuildLockRepository.release();
        }
    }

    public AdminSubmissionDebugResponse getSubmissionDebug(String submissionId) {
        var submission = submissionRepository.get(submissionId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Submission not found"));

        return new AdminSubmissionDebugResponse(
            submission,
            riskSignalRepository.findBySubmissionId(submissionId),
            getPlayerBestScores(submission.playerId()),
            classify(submission.playerId())
        );
    }

    public SeasonMetadataResponse getActiveSeason() {
        var active = seasonService.getActiveSeason()
            .orElseGet(() -> {
                var now = Instant.now();
                var seasonKey = scopeResolver.resolve(now).stream()
                    .filter(scope -> scope.scopeKind() == ScopeKind.SEASONAL)
                    .findFirst()
                    .map(ScopeKey::scopeKey)
                    .orElse(ScopeKind.SEASONAL.apiValue());
                return new com.parallaxpilot.leaderboard.domain.SeasonMetadataRecord(seasonKey, now, null, true);
            });

        return new SeasonMetadataResponse(active.seasonKey(), active.startsAt(), active.endsAt(), active.active());
    }

    public SeasonMetadataResponse cutoverSeason(SeasonCutoverRequest request) {
        var season = seasonService.cutover(request.seasonKey(), request.startsAt());
        return new SeasonMetadataResponse(season.seasonKey(), season.startsAt(), season.endsAt(), season.active());
    }

    private List<LeaderboardEntryResponse> rankEntries(ScopeKind scopeKind, String scopeKey) {
        var entries = rankedEntries(scopeKind, scopeKey);

        var ranked = new ArrayList<LeaderboardEntryResponse>();
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

        return ranked;
    }

    private List<SubmittedRoundClassificationResponse> classifySubmittedRound(SubmitScoreRequest request) {
        return scopeResolver.resolve(request.playedAt()).stream()
            .map(scope -> classifySubmittedRound(scope, request))
            .toList();
    }

    private SubmittedRoundClassificationResponse classifySubmittedRound(ScopeKey scope, SubmitScoreRequest request) {
        var rankedEntries = rankedEntries(scope.scopeKind(), scope.scopeKey());
        int candidateRank = 1;
        for (var rankedEntry : rankedEntries) {
            if (LeaderboardRanking.compare(
                request.score(),
                request.survivedMs(),
                request.playedAt(),
                request.playerId(),
                rankedEntry.score(),
                rankedEntry.survivedMs(),
                rankedEntry.playedAt(),
                rankedEntry.playerId()
            ) > 0) {
                candidateRank += 1;
            } else {
                break;
            }
        }

        int totalPlayers = rankedEntries.size() + 1;
        Integer exactRank = candidateRank <= properties.exactRankThreshold() ? candidateRank : null;
        String approximateBand = exactRank != null ? null : approximateBand(candidateRank, totalPlayers);
        return new SubmittedRoundClassificationResponse(
            scope.scopeKind().apiValue(),
            scope.scopeKey(),
            request.score(),
            request.survivedMs(),
            exactRank,
            approximateBand,
            totalPlayers,
            CLASSIFICATION_BASIS_SUBMITTED_ROUND,
            CLASSIFICATION_AVAILABILITY_ESTIMATED
        );
    }

    private List<SubmittedRoundClassificationResponse> unavailableSubmittedRoundClassifications(
        SubmitScoreRequest request,
        String availability
    ) {
        return scopeResolver.resolve(request.playedAt()).stream()
            .map(scope -> new SubmittedRoundClassificationResponse(
                scope.scopeKind().apiValue(),
                scope.scopeKey(),
                request.score(),
                request.survivedMs(),
                null,
                null,
                0,
                CLASSIFICATION_BASIS_SUBMITTED_ROUND,
                availability
            ))
            .toList();
    }

    private List<LeaderboardEntry> rankedEntries(ScopeKind scopeKind, String scopeKey) {
        return leaderboardEntryRepository
            .queryByPartitionKey(
                LeaderboardKeys.scopePartitionKey(scopeKind, scopeKey),
                properties.maxLeaderboardScan()
            )
            .stream()
            .sorted(LeaderboardRanking.ENTRY_ORDER)
            .collect(
                LinkedHashMap<String, LeaderboardEntry>::new,
                (map, entry) -> map.putIfAbsent(entry.playerId(), entry),
                LinkedHashMap::putAll
            )
            .values()
            .stream()
            .toList();
    }

    private int indexOfPlayer(List<LeaderboardEntryResponse> ranked, String playerId) {
        for (int index = 0; index < ranked.size(); index += 1) {
            if (ranked.get(index).playerId().equals(playerId)) {
                return index;
            }
        }
        return -1;
    }

    private String approximateBand(int rank, int totalPlayers) {
        if (totalPlayers <= 0) {
            return RankingBands.UNRANKED;
        }

        var percentile = (double) rank / totalPlayers;
        if (percentile <= 0.10d) {
            return RankingBands.TOP_10;
        }
        if (percentile <= 0.25d) {
            return RankingBands.TOP_25;
        }
        if (percentile <= 0.50d) {
            return RankingBands.TOP_50;
        }
        if (percentile <= 0.75d) {
            return RankingBands.TOP_75;
        }
        return RankingBands.BOTTOM_25;
    }

    private ScopeKind scopeKind(String scope) {
        return ScopeKind.fromApi(scope);
    }

    private String activeScopeKey(ScopeKind scopeKind) {
        return scopeResolver.resolve(Instant.now()).stream()
            .filter(scope -> scope.scopeKind() == scopeKind)
            .findFirst()
            .map(ScopeKey::scopeKey)
            .orElseThrow();
    }
}
