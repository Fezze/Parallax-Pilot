package com.parallaxpilot.leaderboard.repository;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.domain.ProjectionTask;
import com.parallaxpilot.leaderboard.domain.ScopeKind;

import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.BatchResultErrorEntry;
import software.amazon.awssdk.services.sqs.model.DeleteMessageBatchRequest;
import software.amazon.awssdk.services.sqs.model.DeleteMessageBatchResponse;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlResponse;
import software.amazon.awssdk.services.sqs.model.Message;
import software.amazon.awssdk.services.sqs.model.PurgeQueueInProgressException;
import software.amazon.awssdk.services.sqs.model.ReceiveMessageRequest;
import software.amazon.awssdk.services.sqs.model.ReceiveMessageResponse;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

class ProjectionQueueRepositoryTest {

    private static LeaderboardProperties properties() {
        return new LeaderboardProperties("test-", 10, 7, 7, "queue", true, 30000L, 10, 60, 1000, 10000L, 1000, 5000L, 15, false, "snapshots");
    }

    @Test
    void publishSerializesTaskAndSendsItToResolvedQueueUrl() {
        SqsClient sqs = mock(SqsClient.class);
        when(sqs.getQueueUrl(any(java.util.function.Consumer.class))).thenReturn(GetQueueUrlResponse.builder().queueUrl("https://queue-url").build());
        ProjectionQueueRepository repo = new ProjectionQueueRepository(
            sqs,
            new ObjectMapper().findAndRegisterModules(),
            properties(),
            new SimpleMeterRegistry()
        );

        repo.publish(new ProjectionTask(
            "sub-1",
            "player-1",
            "Pilot",
            ScopeKind.GLOBAL,
            "global",
            1200,
            15000,
            Instant.parse("2026-04-19T12:00:00Z")
        ));

        verify(sqs).sendMessage(any(SendMessageRequest.class));
        verify(sqs, times(1)).getQueueUrl(any(java.util.function.Consumer.class));
    }

    @Test
    void receiveBatchDeserializesMessagesAndDeleteBatchRemovesThem() {
        SqsClient sqs = mock(SqsClient.class);
        when(sqs.getQueueUrl(any(java.util.function.Consumer.class))).thenReturn(GetQueueUrlResponse.builder().queueUrl("https://queue-url").build());
        when(sqs.receiveMessage(any(ReceiveMessageRequest.class))).thenReturn(ReceiveMessageResponse.builder()
            .messages(List.of(
                Message.builder()
                    .receiptHandle("rh-1")
                    .body("{" +
                        "\"submissionId\":\"sub-1\"," +
                        "\"playerId\":\"player-1\"," +
                        "\"nickname\":\"Pilot\"," +
                        "\"scopeKind\":\"GLOBAL\"," +
                        "\"scopeKey\":\"global\"," +
                        "\"score\":1200," +
                        "\"survivedMs\":15000," +
                        "\"playedAt\":\"2026-04-19T12:00:00Z\"}")
                    .build()))
            .build());
        when(sqs.deleteMessageBatch(any(DeleteMessageBatchRequest.class))).thenReturn(DeleteMessageBatchResponse.builder().build());
        ProjectionQueueRepository repo = new ProjectionQueueRepository(
            sqs,
            new ObjectMapper().findAndRegisterModules(),
            properties(),
            new SimpleMeterRegistry()
        );

        var tasks = repo.receiveBatch(25);

        assertEquals(1, tasks.size());
        assertEquals("sub-1", tasks.getFirst().payload().submissionId());
        repo.deleteBatch(tasks);
        verify(sqs).deleteMessageBatch(any(DeleteMessageBatchRequest.class));
        verify(sqs, times(1)).getQueueUrl(any(java.util.function.Consumer.class));
    }

    @Test
    void purgeSwallowsShortIntervalSqsPurgeConflicts() {
        SqsClient sqs = mock(SqsClient.class);
        when(sqs.getQueueUrl(any(java.util.function.Consumer.class))).thenReturn(GetQueueUrlResponse.builder().queueUrl("https://queue-url").build());
        org.mockito.Mockito.doThrow(PurgeQueueInProgressException.builder().message("busy").build())
            .when(sqs)
            .purgeQueue(any(java.util.function.Consumer.class));
        ProjectionQueueRepository repo = new ProjectionQueueRepository(
            sqs,
            new ObjectMapper().findAndRegisterModules(),
            properties(),
            new SimpleMeterRegistry()
        );

        assertDoesNotThrow(repo::purge);
    }

    @Test
    void deleteBatchSkipsEmptyLists() {
        SqsClient sqs = mock(SqsClient.class);
        when(sqs.getQueueUrl(any(java.util.function.Consumer.class))).thenReturn(GetQueueUrlResponse.builder().queueUrl("https://queue-url").build());
        ProjectionQueueRepository repo = new ProjectionQueueRepository(
            sqs,
            new ObjectMapper().findAndRegisterModules(),
            properties(),
            new SimpleMeterRegistry()
        );

        repo.deleteBatch(List.of());

        assertTrue(org.mockito.Mockito.mockingDetails(sqs).getInvocations().stream()
            .noneMatch(invocation -> invocation.getMethod().getName().equals("deleteMessageBatch")));
    }

    @Test
    void deleteBatchCountsPartialFailures() {
        SqsClient sqs = mock(SqsClient.class);
        var meterRegistry = new SimpleMeterRegistry();
        when(sqs.getQueueUrl(any(java.util.function.Consumer.class))).thenReturn(GetQueueUrlResponse.builder().queueUrl("https://queue-url").build());
        when(sqs.deleteMessageBatch(any(DeleteMessageBatchRequest.class))).thenReturn(DeleteMessageBatchResponse.builder()
            .failed(BatchResultErrorEntry.builder().id("0").code("ReceiptHandleIsInvalid").build())
            .build());
        ProjectionQueueRepository repo = new ProjectionQueueRepository(
            sqs,
            new ObjectMapper().findAndRegisterModules(),
            properties(),
            meterRegistry
        );

        repo.deleteBatch(List.of(new ProjectionQueueRepository.QueuedProjectionTask(
            Message.builder().receiptHandle("rh-1").body("{}").build(),
            new ProjectionTask("sub-1", "player-1", "Pilot", ScopeKind.GLOBAL, "global", 1200, 15000, Instant.parse("2026-04-19T12:00:00Z"))
        )));

        assertEquals(1.0, meterRegistry.counter("leaderboard.projection.queue.delete.failures").count());
    }
}