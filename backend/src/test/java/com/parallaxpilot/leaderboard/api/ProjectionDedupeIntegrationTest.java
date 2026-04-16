package com.parallaxpilot.leaderboard.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;

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
class ProjectionDedupeIntegrationTest extends LocalStackIntegrationSupport {

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
    void duplicateProjectionTasksAreDeduped() {
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

        var task = new ProjectionTask("sub-1", "player-1", "Pilot", ScopeKind.GLOBAL, "global", 1200, 15000L, playedAt);
        projectionQueueRepository.publish(task);
        projectionQueueRepository.publish(task);

        projectionService.drainProjectionQueueFully();

        var entries = repository.queryByPartitionKey(LeaderboardTables.LEADERBOARD_ENTRIES, LeaderboardKeys.scopePartitionKey(ScopeKind.GLOBAL, "global"), LeaderboardEntry.class);
        assertEquals(1, entries.size(), "Only one leaderboard entry should exist after dedupe");

        var index = projectionIndexRepository.get("player-1", ScopeKind.GLOBAL, "global");
        assertTrue(index.isPresent(), "Projection index must be present for the player after processing");
    }
}
