package com.parallaxpilot.leaderboard.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.GetQueueAttributesRequest;
import software.amazon.awssdk.services.sqs.model.GetQueueAttributesResponse;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlRequest;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlResponse;

class ProjectionQueueMetricsServiceTest {

    @Test
    void retainsLastSuccessfulSnapshotAndCountsRefreshFailures() {
        var sqsClient = Mockito.mock(SqsClient.class);
        var meterRegistry = new SimpleMeterRegistry();
        var service = new ProjectionQueueMetricsService(sqsClient, properties(), meterRegistry);

        when(sqsClient.getQueueUrl(any(GetQueueUrlRequest.class)))
            .thenReturn(GetQueueUrlResponse.builder().queueUrl("http://localhost/queue/test").build());
        when(sqsClient.getQueueAttributes(any(GetQueueAttributesRequest.class)))
            .thenReturn(GetQueueAttributesResponse.builder()
                .attributesWithStrings(java.util.Map.of(
                    "ApproximateNumberOfMessages", "7",
                    "ApproximateNumberOfMessagesNotVisible", "2",
                    "ApproximateNumberOfMessagesDelayed", "1",
                    "ApproximateAgeOfOldestMessage", "11"
                ))
                .build())
            .thenThrow(new IllegalStateException("boom"));

        service.refreshMetrics();

        assertEquals(7.0, gaugeValue(meterRegistry, "leaderboard.projection.queue.visible"));
        assertEquals(2.0, gaugeValue(meterRegistry, "leaderboard.projection.queue.inflight"));
        assertEquals(1.0, gaugeValue(meterRegistry, "leaderboard.projection.queue.delayed"));
        assertEquals(11.0, gaugeValue(meterRegistry, "leaderboard.projection.queue.oldest_age_seconds"));

        assertDoesNotThrow(service::refreshMetrics);
        assertEquals(7.0, gaugeValue(meterRegistry, "leaderboard.projection.queue.visible"));
        assertEquals(1.0, counterValue(meterRegistry, "leaderboard.projection.queue.metrics.refresh.failures"));
    }

    private double gaugeValue(SimpleMeterRegistry meterRegistry, String name) {
        var gauge = meterRegistry.find(name).tag("queue", "queue").gauge();
        assertNotNull(gauge);
        return gauge.value();
    }

    private double counterValue(SimpleMeterRegistry meterRegistry, String name) {
        var counter = meterRegistry.find(name).tag("queue", "queue").counter();
        assertNotNull(counter);
        return counter.count();
    }

    private LeaderboardProperties properties() {
        return new LeaderboardProperties("test-", 10, 7, "queue", true, 30000L, 10, 60, 1000, 10000L, 1000, 5000L, 15, false, "snapshots");
    }
}