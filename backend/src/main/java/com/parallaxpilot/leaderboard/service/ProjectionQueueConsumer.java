package com.parallaxpilot.leaderboard.service;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.parallaxpilot.leaderboard.repository.RebuildLockRepository;

@Component
@ConditionalOnProperty(
    prefix = "app.leaderboard",
    name = "projection-consumer-enabled",
    havingValue = "true"
)
public class ProjectionQueueConsumer {

    private final ProjectionService projectionService;
    private final RebuildLockRepository rebuildLockRepository;

    public ProjectionQueueConsumer(
        ProjectionService projectionService,
        RebuildLockRepository rebuildLockRepository
    ) {
        this.projectionService = projectionService;
        this.rebuildLockRepository = rebuildLockRepository;
    }

    @Scheduled(fixedDelayString = "${app.leaderboard.consumer-fixed-delay-ms:5000}")
    void scheduledDrain() {
        if (rebuildLockRepository.isActive()) {
            return;
        }
        projectionService.drainProjectionQueue();
    }
}
