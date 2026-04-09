package com.parallaxpilot.leaderboard.repository;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.domain.ProjectionTask;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.DeleteMessageBatchRequest;
import software.amazon.awssdk.services.sqs.model.DeleteMessageBatchRequestEntry;
import software.amazon.awssdk.services.sqs.model.Message;
import software.amazon.awssdk.services.sqs.model.ReceiveMessageRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

@Component
public class ProjectionQueueRepository {

    private final SqsClient sqsClient;
    private final ObjectMapper objectMapper;
    private final LeaderboardProperties properties;

    public ProjectionQueueRepository(
        SqsClient sqsClient,
        ObjectMapper objectMapper,
        LeaderboardProperties properties
    ) {
        this.sqsClient = sqsClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public void publish(ProjectionTask task) {
        sqsClient.sendMessage(SendMessageRequest.builder()
            .queueUrl(queueUrl())
            .messageBody(writeJson(task))
            .build());
    }

    public List<QueuedProjectionTask> receiveBatch(int maxMessages) {
        var response = sqsClient.receiveMessage(ReceiveMessageRequest.builder()
            .queueUrl(queueUrl())
            .maxNumberOfMessages(Math.min(maxMessages, 10))
            .waitTimeSeconds(1)
            .build());

        return response.messages().stream()
            .map(message -> new QueuedProjectionTask(message, readJson(message)))
            .toList();
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

        sqsClient.deleteMessageBatch(DeleteMessageBatchRequest.builder()
            .queueUrl(queueUrl())
            .entries(entries)
            .build());
    }

    private String queueUrl() {
        return sqsClient.getQueueUrl(builder -> builder.queueName(properties.projectionQueueName())).queueUrl();
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
