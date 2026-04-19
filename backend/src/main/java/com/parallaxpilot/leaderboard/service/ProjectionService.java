package com.parallaxpilot.leaderboard.service;

import java.time.Instant;
import java.util.ArrayList;

import com.parallaxpilot.leaderboard.domain.BestScoreRecord;
import com.parallaxpilot.leaderboard.domain.LeaderboardKeys;
import com.parallaxpilot.leaderboard.domain.LeaderboardEntry;
import com.parallaxpilot.leaderboard.domain.LeaderboardRanking;
import com.parallaxpilot.leaderboard.repository.BestScoreRepository;
import com.parallaxpilot.leaderboard.repository.LeaderboardEntryRepository;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.parallaxpilot.leaderboard.repository.ProjectionIndexRepository;
import com.parallaxpilot.leaderboard.repository.ProjectionProcessedRepository;
import com.parallaxpilot.leaderboard.repository.ProjectionQueueRepository;

@Service
public class ProjectionService {
    private static final Logger LOG = LoggerFactory.getLogger(ProjectionService.class);

    private final ProjectionQueueRepository projectionQueueRepository;
    private final ProjectionIndexRepository projectionIndexRepository;
    private final ProjectionProcessedRepository projectionProcessedRepository;
    private final LeaderboardEntryRepository leaderboardEntryRepository;
    private final BestScoreRepository bestScoreRepository;
    private final MeterRegistry meterRegistry;

    public ProjectionService(
        ProjectionQueueRepository projectionQueueRepository,
        ProjectionIndexRepository projectionIndexRepository,
        ProjectionProcessedRepository projectionProcessedRepository,
        LeaderboardEntryRepository leaderboardEntryRepository,
        BestScoreRepository bestScoreRepository,
        MeterRegistry meterRegistry
    ) {
        this.projectionQueueRepository = projectionQueueRepository;
        this.projectionIndexRepository = projectionIndexRepository;
        this.projectionProcessedRepository = projectionProcessedRepository;
        this.leaderboardEntryRepository = leaderboardEntryRepository;
        this.bestScoreRepository = bestScoreRepository;
        this.meterRegistry = meterRegistry;
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

            var newSortKey = leaderboardSortKey(payload.score(), payload.survivedMs(), payload.playedAt(), payload.playerId());
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
        meterRegistry.counter("leaderboard.projection.messages.processed").increment(processed.size());
        LOG.info("projection_drain processedMessages={} receivedMessages={}", processed.size(), tasks.size());
        return processed.size();
    }

    public int drainProjectionQueueFully() {
        var sample = Timer.start(meterRegistry);
        var outcome = "success";
        try {
            int total = 0;
            int processed;
            do {
                processed = drainProjectionQueue();
                total += processed;
            } while (processed > 0);
            return total;
        } catch (RuntimeException error) {
            outcome = "error";
            throw error;
        } finally {
            sample.stop(Timer.builder("leaderboard.projection.drain.latency")
                .tag("operation", "projection_drain")
                .tag("outcome", outcome)
                .register(meterRegistry));
        }
    }

    private String leaderboardSortKey(int score, long survivedMs, Instant playedAt, String playerId) {
        return LeaderboardRanking.sortKey(score, survivedMs, playedAt, playerId);
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
