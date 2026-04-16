package com.parallaxpilot.leaderboard.service;

import java.time.Instant;
import java.util.ArrayList;

import com.parallaxpilot.leaderboard.domain.BestScoreRecord;
import com.parallaxpilot.leaderboard.domain.LeaderboardKeys;
import com.parallaxpilot.leaderboard.domain.LeaderboardEntry;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.parallaxpilot.leaderboard.repository.DynamoDbJsonRepository;
import com.parallaxpilot.leaderboard.repository.LeaderboardTables;
import com.parallaxpilot.leaderboard.repository.ProjectionIndexRepository;      
import com.parallaxpilot.leaderboard.repository.ProjectionQueueRepository;      
import com.parallaxpilot.leaderboard.repository.ProjectionProcessedRepository;
import com.parallaxpilot.leaderboard.repository.RebuildLockRepository;

@Service
public class ProjectionService {

    private final ProjectionQueueRepository projectionQueueRepository;
    private final DynamoDbJsonRepository repository;
    private final ProjectionIndexRepository projectionIndexRepository;
    private final ProjectionProcessedRepository projectionProcessedRepository;
    private final LeaderboardEntryRepository leaderboardEntryRepository;
    private final RebuildLockRepository rebuildLockRepository;

    public ProjectionService(
        ProjectionQueueRepository projectionQueueRepository,
        DynamoDbJsonRepository repository,
        ProjectionIndexRepository projectionIndexRepository,
        ProjectionProcessedRepository projectionProcessedRepository,
        LeaderboardEntryRepository leaderboardEntryRepository,
        RebuildLockRepository rebuildLockRepository
    ) {
        this.projectionQueueRepository = projectionQueueRepository;
        this.repository = repository;
        this.projectionIndexRepository = projectionIndexRepository;
        this.projectionProcessedRepository = projectionProcessedRepository;
        this.leaderboardEntryRepository = leaderboardEntryRepository;
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

            // dedupe projection processing by submissionId
            if (!projectionProcessedRepository.acquire(payload.submissionId(), Instant.now())) {
                // already processed - delete message and continue
                processed.add(task);
                continue;
            }
            var currentBest = repository.get(
                LeaderboardTables.BEST_SCORES,
                payload.playerId(),
                LeaderboardKeys.scopePartitionKey(payload.scopeKind(), payload.scopeKey()),
                BestScoreRecord.class
            );

            if (currentBest.isPresent() && matches(payload, currentBest.get())) {
                var newSortKey = leaderboardSortKey(payload.score(), payload.playedAt().toEpochMilli(), payload.playerId());
                var currentIndex = projectionIndexRepository.get(payload.playerId(), payload.scopeKind(), payload.scopeKey());

                if (currentIndex.isPresent() && !currentIndex.get().leaderboardSortKey().equals(newSortKey)) {
                    repository.delete(
                        LeaderboardTables.LEADERBOARD_ENTRIES,
                        LeaderboardKeys.scopePartitionKey(payload.scopeKind(), payload.scopeKey()),
                        currentIndex.get().leaderboardSortKey()
                    );
                }

                if (currentIndex.isEmpty() || !currentIndex.get().leaderboardSortKey().equals(newSortKey)) {
                    var entry = new LeaderboardEntry(
                        payload.playerId(),
                        payload.nickname(),
                        payload.scopeKind(),
                        payload.scopeKey(),
                        payload.score(),
                        payload.survivedMs(),
                        payload.playedAt()
                    );

                    boolean entryInserted = repository.putIfNotExists(
                        LeaderboardTables.LEADERBOARD_ENTRIES,
                        LeaderboardKeys.scopePartitionKey(payload.scopeKind(), payload.scopeKey()),
                        newSortKey,
                        entry
                    );

                    if (entryInserted) {
                        var expected = currentIndex.isPresent() ? currentIndex.get() : null;
                        boolean indexSet = projectionIndexRepository.putIfMatches(
                            payload.playerId(),
                            payload.scopeKind(),
                            payload.scopeKey(),
                            newSortKey,
                            expected
                        );

                        if (!indexSet) {
                            // rollback leaderboard entry to keep state consistent
                            repository.delete(
                                LeaderboardTables.LEADERBOARD_ENTRIES,
                                LeaderboardKeys.scopePartitionKey(payload.scopeKind(), payload.scopeKey()),
                                newSortKey
                            );
                        }
                    }
                }
            }
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
}
