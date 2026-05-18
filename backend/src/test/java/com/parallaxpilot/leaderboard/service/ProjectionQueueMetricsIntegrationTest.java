package com.parallaxpilot.leaderboard.service;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import com.parallaxpilot.leaderboard.domain.ProjectionTask;
import com.parallaxpilot.leaderboard.repository.ProjectionQueueRepository;
import com.parallaxpilot.leaderboard.support.LocalStackIntegrationSupport;

import io.micrometer.core.instrument.MeterRegistry;

@SpringBootTest
@ActiveProfiles("test")
class ProjectionQueueMetricsIntegrationTest extends LocalStackIntegrationSupport {

    @Autowired
    private ProjectionQueueMetricsService projectionQueueMetricsService;

    @Autowired
    private ProjectionQueueRepository projectionQueueRepository;

    @Autowired
    private MeterRegistry meterRegistry;

    @BeforeAll
    static void bootstrap() {
        bootstrapResources();
    }

    @BeforeEach
    void reset() {
        resetResources();
        projectionQueueMetricsService.refreshMetrics();
    }

    @Test
    void refreshesAndRegistersProjectionQueueMetricsFromLocalStack() {
        assertNotNull(meterRegistry.find("leaderboard.projection.queue.visible").tag("queue", "pp_score-submissions").gauge());
        assertNotNull(meterRegistry.find("leaderboard.projection.queue.inflight").tag("queue", "pp_score-submissions").gauge());
        assertNotNull(meterRegistry.find("leaderboard.projection.queue.delayed").tag("queue", "pp_score-submissions").gauge());
        assertNotNull(meterRegistry.find("leaderboard.projection.queue.oldest_age_seconds").tag("queue", "pp_score-submissions").gauge());

        projectionQueueRepository.publish(new ProjectionTask(
            "sub-metrics-1",
            "player-metrics-1",
            "Pilot",
            com.parallaxpilot.leaderboard.domain.ScopeKind.GLOBAL,
            "global",
            1200,
            14000,
            java.time.Instant.now()
        ));

        refreshUntil(() -> gaugeValue("leaderboard.projection.queue.visible") >= 1.0);
        assertTrue(gaugeValue("leaderboard.projection.queue.visible") >= 1.0);
        assertTrue(gaugeValue("leaderboard.projection.queue.oldest_age_seconds") >= 0.0);

        projectionQueueRepository.receiveBatch(1);
        refreshUntil(() -> gaugeValue("leaderboard.projection.queue.inflight") >= 1.0);
        assertTrue(gaugeValue("leaderboard.projection.queue.inflight") >= 1.0);
    }

    private void refreshUntil(java.util.function.BooleanSupplier condition) {
        for (int attempt = 0; attempt < 10; attempt += 1) {
            projectionQueueMetricsService.refreshMetrics();
            if (condition.getAsBoolean()) {
                return;
            }
            try {
                Thread.sleep(100L);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Interrupted while waiting for queue metrics", interrupted);
            }
        }
    }

    private double gaugeValue(String name) {
        var gauge = meterRegistry.find(name).tag("queue", "pp_score-submissions").gauge();
        assertNotNull(gauge);
        return gauge.value();
    }
}