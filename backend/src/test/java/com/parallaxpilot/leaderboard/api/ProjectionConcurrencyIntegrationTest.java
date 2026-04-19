package com.parallaxpilot.leaderboard.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.parallaxpilot.leaderboard.domain.BestScoreRecord;
import com.parallaxpilot.leaderboard.domain.LeaderboardEntry;
import com.parallaxpilot.leaderboard.domain.LeaderboardKeys;
import com.parallaxpilot.leaderboard.domain.ProjectionTask;
import com.parallaxpilot.leaderboard.domain.ScopeKind;
import com.parallaxpilot.leaderboard.repository.DynamoDbJsonRepository;
import com.parallaxpilot.leaderboard.repository.LeaderboardTables;
import com.parallaxpilot.leaderboard.repository.ProjectionIndexRepository;
import com.parallaxpilot.leaderboard.repository.ProjectionQueueRepository;
import com.parallaxpilot.leaderboard.service.ProjectionService;
import com.parallaxpilot.leaderboard.support.LocalStackIntegrationSupport;

@SpringBootTest
class ProjectionConcurrencyIntegrationTest extends LocalStackIntegrationSupport {

    @Autowired
    DynamoDbJsonRepository repository;

    @Autowired
    ProjectionQueueRepository projectionQueueRepository;

    @Autowired
    ProjectionService projectionService;

    @Autowired
    ProjectionIndexRepository projectionIndexRepository;

    @BeforeAll
    static void beforeAll() {
        bootstrapResources();
    }

    @BeforeEach
    void beforeEach() {
        resetResources();
    }

    @Test
    void concurrentProjectionProcessingProducesSingleEntry() throws InterruptedException, ExecutionException {
        var playedAt = Instant.parse("2026-04-09T12:00:00Z");

        var best = new BestScoreRecord(
            "player-1",
            "Pilot",
            ScopeKind.GLOBAL,
            "global",
            1200,
            15000L,
            playedAt
        );

        repository.put(LeaderboardTables.BEST_SCORES, best.playerId(), LeaderboardKeys.scopePartitionKey(best.scopeKind(), best.scopeKey()), best);

        int tasks = 50;
        for (int i = 0; i < tasks; i++) {
            var task = new ProjectionTask("sub-" + i, "player-1", "Pilot", ScopeKind.GLOBAL, "global", 1200, 15000L, playedAt);
            projectionQueueRepository.publish(task);
        }

        int workers = 6;
        ExecutorService executor = Executors.newFixedThreadPool(workers);
        CountDownLatch start = new CountDownLatch(1);

        List<Callable<Integer>> jobs = new ArrayList<>();
        for (int i = 0; i < workers; i++) {
            jobs.add(() -> {
                start.await();
                // each worker will try to drain the queue fully
                return projectionService.drainProjectionQueueFully();
            });
        }

        start.countDown();
        List<Future<Integer>> futures = executor.invokeAll(jobs);

        // wait for completion
        executor.shutdown();
        executor.awaitTermination(60, TimeUnit.SECONDS);

        // verify only one leaderboard entry exists for the scope
        var entries = repository.queryByPartitionKey(LeaderboardTables.LEADERBOARD_ENTRIES, LeaderboardKeys.scopePartitionKey(ScopeKind.GLOBAL, "global"), LeaderboardEntry.class);
        assertEquals(1, entries.size(), "Only one leaderboard entry should exist after concurrent processing");

        var idx = projectionIndexRepository.get("player-1", ScopeKind.GLOBAL, "global");
        assertTrue(idx.isPresent(), "Projection index should be set");
    }
}
