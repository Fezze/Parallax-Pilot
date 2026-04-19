package com.parallaxpilot.leaderboard.repository;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.domain.ProjectionTask;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.DeleteMessageBatchRequest;
import software.amazon.awssdk.services.sqs.model.DeleteMessageBatchRequestEntry;
import software.amazon.awssdk.services.sqs.model.Message;
import software.amazon.awssdk.services.sqs.model.PurgeQueueInProgressException;
import software.amazon.awssdk.services.sqs.model.ReceiveMessageRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

@Component
public class ProjectionQueueRepository {
    private static final Logger LOG = LoggerFactory.getLogger(ProjectionQueueRepository.class);

    private final SqsClient sqsClient;
    private final ObjectMapper objectMapper;
    private final LeaderboardProperties properties;
    private final MeterRegistry meterRegistry;
    private final AtomicReference<String> queueUrlCache = new AtomicReference<>();

    public ProjectionQueueRepository(
        SqsClient sqsClient,
        ObjectMapper objectMapper,
        LeaderboardProperties properties,
        MeterRegistry meterRegistry
    ) {
        this.sqsClient = sqsClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.meterRegistry = meterRegistry;
    }

    public void publish(ProjectionTask task) {
        try {
            sqsClient.sendMessage(SendMessageRequest.builder()
                .queueUrl(queueUrl())
                .messageBody(writeJson(task))
                .build());
        } catch (RuntimeException error) {
            queueUrlCache.set(null);
            throw error;
        }
    }

    public List<QueuedProjectionTask> receiveBatch(int maxMessages) {
        try {
            var response = sqsClient.receiveMessage(ReceiveMessageRequest.builder()
                .queueUrl(queueUrl())
                .maxNumberOfMessages(Math.min(maxMessages, 10))
                .waitTimeSeconds(1)
                .build());

            return response.messages().stream()
                .map(message -> new QueuedProjectionTask(message, readJson(message)))
                .toList();
        } catch (RuntimeException error) {
            queueUrlCache.set(null);
            throw error;
        }
    }

    public void deleteBatch(List<QueuedProjectionTask> tasks) {
        if (tasks.isEmpty()) {
            return;
        }

        var entries = new ArrayList<DeleteMessageBatchRequestEntry>();
        for (int index = 0; index < tasks.size(); index += 1) {
            entries.add(DeleteMessageBatchRequestEntry.builder()
                .id(Integer.toString(index))
                .receiptHandle(tasks.get(index).message().receiptHandle())
                .build());
        }

        try {
            var response = sqsClient.deleteMessageBatch(DeleteMessageBatchRequest.builder()
                .queueUrl(queueUrl())
                .entries(entries)
                .build());

            if (!response.failed().isEmpty()) {
                meterRegistry.counter("leaderboard.projection.queue.delete.failures").increment(response.failed().size());
                LOG.warn("projection_queue_delete_partial_failure failedEntries={}", response.failed().size());
            }
        } catch (RuntimeException error) {
            queueUrlCache.set(null);
            throw error;
        }
    }

    public void purge() {
        try {
            sqsClient.purgeQueue(builder -> builder.queueUrl(queueUrl()));
        } catch (PurgeQueueInProgressException ignored) {
            // SQS allows only one purge per short interval; existing queue state is already being reset.
        } catch (RuntimeException error) {
            queueUrlCache.set(null);
            throw error;
        }
    }

    private String queueUrl() {
        var cached = queueUrlCache.get();
        if (cached != null) {
            return cached;
        }

        var resolved = sqsClient.getQueueUrl(builder -> builder.queueName(properties.projectionQueueName())).queueUrl();
        queueUrlCache.compareAndSet(null, resolved);
        return queueUrlCache.get();
    }

    private String writeJson(ProjectionTask value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Failed to serialize projection task", error);
        }
    }

    private ProjectionTask readJson(Message message) {
        try {
            return objectMapper.readValue(message.body(), ProjectionTask.class);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Failed to deserialize projection task", error);
        }
    }

    public record QueuedProjectionTask(Message message, ProjectionTask payload) {
    }
}
