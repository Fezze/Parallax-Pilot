package com.parallaxpilot.leaderboard.service;

import java.util.ArrayList;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.parallaxpilot.leaderboard.domain.LeaderboardEntry;
import com.parallaxpilot.leaderboard.repository.DynamoDbJsonRepository;
import com.parallaxpilot.leaderboard.repository.ProjectionQueueRepository;

@Service
public class ProjectionService {

    private final ProjectionQueueRepository projectionQueueRepository;
    private final DynamoDbJsonRepository repository;

    public ProjectionService(
        ProjectionQueueRepository projectionQueueRepository,
        DynamoDbJsonRepository repository
    ) {
        this.projectionQueueRepository = projectionQueueRepository;
        this.repository = repository;
    }

    @Scheduled(fixedDelayString = "${app.leaderboard.consumer-fixed-delay-ms:5000}")
    void scheduledDrain() {
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
            repository.put(
                "leaderboard_entries",
                payload.scopeKind().name() + "#" + payload.scopeKey(),
                leaderboardSortKey(payload.score(), payload.playedAt().toEpochMilli(), payload.playerId()),
                new LeaderboardEntry(
                    payload.playerId(),
                    payload.nickname(),
                    payload.scopeKind(),
                    payload.scopeKey(),
                    payload.score(),
                    payload.survivedMs(),
                    payload.playedAt()
                )
            );
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
}
