package com.parallaxpilot.leaderboard.service;

import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.GetQueueAttributesRequest;
import software.amazon.awssdk.services.sqs.model.GetQueueAttributesResponse;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlRequest;

@Component
@ConditionalOnProperty(prefix = "app.leaderboard", name = "projection-queue-metrics-enabled", havingValue = "true", matchIfMissing = true)
public class ProjectionQueueMetricsService {

    private static final Logger LOG = LoggerFactory.getLogger(ProjectionQueueMetricsService.class);
    private static final String ATTR_VISIBLE = "ApproximateNumberOfMessages";
    private static final String ATTR_INFLIGHT = "ApproximateNumberOfMessagesNotVisible";
    private static final String ATTR_DELAYED = "ApproximateNumberOfMessagesDelayed";
    private static final String ATTR_OLDEST_AGE = "ApproximateAgeOfOldestMessage";
    private static final String ATTR_ALL = "All";

    private final SqsClient sqsClient;
    private final String queueName;
    private final Counter refreshFailures;
    private final AtomicReference<String> queueUrl = new AtomicReference<>();
    private final AtomicLong visibleMessages = new AtomicLong();
    private final AtomicLong inflightMessages = new AtomicLong();
    private final AtomicLong delayedMessages = new AtomicLong();
    private final AtomicLong oldestAgeSeconds = new AtomicLong();

    public ProjectionQueueMetricsService(SqsClient sqsClient, LeaderboardProperties properties, MeterRegistry meterRegistry) {
        this.sqsClient = sqsClient;
        this.queueName = properties.projectionQueueName();
        var tags = Tags.of("queue", queueName);

        meterRegistry.gauge("leaderboard.projection.queue.visible", tags, visibleMessages);
        meterRegistry.gauge("leaderboard.projection.queue.inflight", tags, inflightMessages);
        meterRegistry.gauge("leaderboard.projection.queue.delayed", tags, delayedMessages);
        meterRegistry.gauge("leaderboard.projection.queue.oldest_age_seconds", tags, oldestAgeSeconds);
        this.refreshFailures = Counter.builder("leaderboard.projection.queue.metrics.refresh.failures")
            .tags(tags)
            .register(meterRegistry);
    }

    @Scheduled(fixedDelayString = "${app.leaderboard.projection-queue-metrics-refresh-ms:30000}")
    void scheduledRefresh() {
        refreshMetrics();
    }

    public void refreshMetrics() {
        try {
            var response = sqsClient.getQueueAttributes(GetQueueAttributesRequest.builder()
                .queueUrl(resolveQueueUrl())
                .attributeNamesWithStrings(ATTR_ALL)
                .build());

            visibleMessages.set(attributeValue(response, ATTR_VISIBLE));
            inflightMessages.set(attributeValue(response, ATTR_INFLIGHT));
            delayedMessages.set(attributeValue(response, ATTR_DELAYED));
            oldestAgeSeconds.set(attributeValue(response, ATTR_OLDEST_AGE));
        } catch (Exception error) {
            queueUrl.set(null);
            refreshFailures.increment();
            LOG.warn(
                "projection_queue_metrics_refresh_failed queueName={} exceptionType={}",
                queueName,
                error.getClass().getSimpleName(),
                error
            );
        }
    }

    private String resolveQueueUrl() {
        var cachedQueueUrl = queueUrl.get();
        if (cachedQueueUrl != null) {
            return cachedQueueUrl;
        }

        var resolvedQueueUrl = sqsClient.getQueueUrl(GetQueueUrlRequest.builder()
            .queueName(queueName)
            .build())
            .queueUrl();
        queueUrl.set(resolvedQueueUrl);
        return resolvedQueueUrl;
    }

    private long attributeValue(GetQueueAttributesResponse response, String attributeName) {
        return parseLong(response.attributesAsStrings().getOrDefault(attributeName, "0"));
    }

    private long parseLong(String rawValue) {
        try {
            return Long.parseLong(rawValue);
        } catch (NumberFormatException ignored) {
            return 0L;
        }
    }
}