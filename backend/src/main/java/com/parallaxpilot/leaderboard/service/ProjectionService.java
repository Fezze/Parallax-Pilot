package com.parallaxpilot.leaderboard.service;

import java.time.Instant;
import java.util.ArrayList;

import com.parallaxpilot.leaderboard.domain.BestScoreRecord;
import com.parallaxpilot.leaderboard.domain.LeaderboardKeys;
import com.parallaxpilot.leaderboard.domain.LeaderboardEntry;
import com.parallaxpilot.leaderboard.repository.BestScoreRepository;
import com.parallaxpilot.leaderboard.repository.LeaderboardEntryRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.parallaxpilot.leaderboard.repository.ProjectionIndexRepository;
import com.parallaxpilot.leaderboard.repository.ProjectionProcessedRepository;
import com.parallaxpilot.leaderboard.repository.ProjectionQueueRepository;
import com.parallaxpilot.leaderboard.repository.RebuildLockRepository;

@Service
public class ProjectionService {

    private final ProjectionQueueRepository projectionQueueRepository;
    private final ProjectionIndexRepository projectionIndexRepository;
    private final ProjectionProcessedRepository projectionProcessedRepository;
    private final LeaderboardEntryRepository leaderboardEntryRepository;
    private final BestScoreRepository bestScoreRepository;
    private final RebuildLockRepository rebuildLockRepository;

    public ProjectionService(
        ProjectionQueueRepository projectionQueueRepository,
        ProjectionIndexRepository projectionIndexRepository,
        ProjectionProcessedRepository projectionProcessedRepository,
        LeaderboardEntryRepository leaderboardEntryRepository,
        BestScoreRepository bestScoreRepository,
        RebuildLockRepository rebuildLockRepository
    ) {
        this.projectionQueueRepository = projectionQueueRepository;
        this.projectionIndexRepository = projectionIndexRepository;
        this.projectionProcessedRepository = projectionProcessedRepository;
        this.leaderboardEntryRepository = leaderboardEntryRepository;
        this.bestScoreRepository = bestScoreRepository;
        this.rebuildLockRepository = rebuildLockRepository;
    }

    @Scheduled(fixedDelayString = "${app.leaderboard.consumer-fixed-delay-ms:5000}")
    void scheduledDrain() {
        if (rebuildLockRepository.isActive()) {
            return;
        }
        drainProjectionQueue();
    }

    public int drainProjectionQueue() {
        var tasks = projectionQueueRepository.receiveBatch(10);
        if (tasks.isEmpty()) {
            return 0;
        }

        var processed = new ArrayList<ProjectionQueueRepository.QueuedProjectionTask>();
        for (var task : tasks) {
            var payload = task.payload();
            var projectionKey = projectionKey(payload);

            if (projectionProcessedRepository.hasProcessed(projectionKey)) {
                processed.add(task);
                continue;
            }

            var currentBest = bestScoreRepository.get(payload.playerId(), payload.scopeKind(), payload.scopeKey());

            if (currentBest.isEmpty() || !matches(payload, currentBest.get())) {
                projectionProcessedRepository.markProcessed(projectionKey, Instant.now());
                processed.add(task);
                continue;
            }

            var newSortKey = leaderboardSortKey(payload.score(), payload.playedAt().toEpochMilli(), payload.playerId());
            var currentIndex = projectionIndexRepository.get(payload.playerId(), payload.scopeKind(), payload.scopeKey());

            if (currentIndex.isPresent() && currentIndex.get().leaderboardSortKey().equals(newSortKey)) {
                projectionProcessedRepository.markProcessed(projectionKey, Instant.now());
                processed.add(task);
                continue;
            }

            if (currentIndex.isPresent()) {
                leaderboardEntryRepository.delete(
                    LeaderboardKeys.scopePartitionKey(payload.scopeKind(), payload.scopeKey()),
                    currentIndex.get().leaderboardSortKey()
                );
            }

            var entry = new LeaderboardEntry(
                payload.playerId(),
                payload.nickname(),
                payload.scopeKind(),
                payload.scopeKey(),
                payload.score(),
                payload.survivedMs(),
                payload.playedAt()
            );

            var entryInserted = leaderboardEntryRepository.putIfNotExists(
                LeaderboardKeys.scopePartitionKey(payload.scopeKind(), payload.scopeKey()),
                newSortKey,
                entry
            );

            if (!entryInserted) {
                if (isAlreadyIndexed(payload, newSortKey)) {
                    projectionProcessedRepository.markProcessed(projectionKey, Instant.now());
                    processed.add(task);
                }
                continue;
            }

            var expected = currentIndex.isPresent() ? currentIndex.get() : null;
            var indexSet = projectionIndexRepository.putIfMatches(
                payload.playerId(),
                payload.scopeKind(),
                payload.scopeKey(),
                newSortKey,
                expected
            );

            if (!indexSet) {
                if (isAlreadyIndexed(payload, newSortKey)) {
                    projectionProcessedRepository.markProcessed(projectionKey, Instant.now());
                    processed.add(task);
                } else {
                    leaderboardEntryRepository.delete(
                        LeaderboardKeys.scopePartitionKey(payload.scopeKind(), payload.scopeKey()),
                        newSortKey
                    );
                }
                continue;
            }

            projectionProcessedRepository.markProcessed(projectionKey, Instant.now());
            processed.add(task);
        }

        projectionQueueRepository.deleteBatch(processed);
        return processed.size();
    }

    public int drainProjectionQueueFully() {
        int total = 0;
        int processed;
        do {
            processed = drainProjectionQueue();
            total += processed;
        } while (processed > 0);
        return total;
    }

    private String leaderboardSortKey(int score, long epochMillis, String playerId) {
        long inverseScore = Integer.MAX_VALUE - score;
        return "%010d#%013d#%s".formatted(inverseScore, epochMillis, playerId);
    }

    private boolean matches(com.parallaxpilot.leaderboard.domain.ProjectionTask payload, BestScoreRecord best) {
        return payload.score() == best.score()
            && payload.survivedMs() == best.survivedMs()
            && payload.playedAt().equals(best.playedAt());
    }

    private boolean isAlreadyIndexed(com.parallaxpilot.leaderboard.domain.ProjectionTask payload, String sortKey) {
        return projectionIndexRepository
            .get(payload.playerId(), payload.scopeKind(), payload.scopeKey())
            .map(index -> index.leaderboardSortKey().equals(sortKey))
            .orElse(false);
    }

    private String projectionKey(com.parallaxpilot.leaderboard.domain.ProjectionTask payload) {
        return "%s#%s#%s".formatted(payload.submissionId(), payload.scopeKind().apiValue(), payload.scopeKey());
    }
}
