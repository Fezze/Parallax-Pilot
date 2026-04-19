package com.parallaxpilot.leaderboard.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemResponse;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

class IdempotencyRepositoryTest {

    private static LeaderboardProperties properties() {
        return new LeaderboardProperties("test-", 10, 7, 7, "queue", true, 30000L, 10, 60, 1000, 10000L, 1000, 5000L, 15, false, "snapshots");
    }

    @Test
    void acquireAndCompleteInvokesDynamo() {
        DynamoDbClient dynamo = mock(DynamoDbClient.class);
        IdempotencyRepository repo = new IdempotencyRepository(dynamo, properties());

        Instant now = Instant.parse("2026-04-16T12:00:00Z");
        var acquired = repo.acquire("sub-1", now);
        assertEquals(IdempotencyRepository.AcquireResult.ACQUIRED, acquired);
        verify(dynamo).putItem(any(PutItemRequest.class));

        boolean completed = repo.complete("sub-1", now.plusSeconds(30));
        assertTrue(completed);
        verify(dynamo).updateItem(any(UpdateItemRequest.class));
    }

    @Test
    void acquireReportsCompletedDuplicatesFromStoredState() {
        DynamoDbClient dynamo = mock(DynamoDbClient.class);
        org.mockito.Mockito.doThrow(software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException.builder().build())
            .when(dynamo)
            .putItem(any(PutItemRequest.class));
        when(dynamo.getItem(any(GetItemRequest.class))).thenReturn(GetItemResponse.builder()
            .item(Map.of(
                DynamoDbAttributes.STATUS, AttributeValue.fromS("COMPLETED"),
                DynamoDbAttributes.CREATED_AT, AttributeValue.fromS("2026-04-16T12:00:00Z"),
                DynamoDbAttributes.EXPIRES_AT, AttributeValue.fromN(Long.toString(Instant.parse("2026-04-23T12:00:00Z").getEpochSecond())),
                DynamoDbAttributes.COMPLETED_AT, AttributeValue.fromS("2026-04-16T12:00:30Z")
            ))
            .build());
        IdempotencyRepository repo = new IdempotencyRepository(dynamo, properties());

        var acquired = repo.acquire("sub-1", Instant.parse("2026-04-16T12:00:00Z"));

        assertEquals(IdempotencyRepository.AcquireResult.ALREADY_COMPLETED, acquired);
    }
}
