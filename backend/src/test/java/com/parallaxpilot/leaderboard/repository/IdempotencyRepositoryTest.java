package com.parallaxpilot.leaderboard.repository;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;

import org.junit.jupiter.api.Test;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

class IdempotencyRepositoryTest {

    @Test
    void acquireAndCompleteInvokesDynamo() {
        DynamoDbClient dynamo = mock(DynamoDbClient.class);
        LeaderboardProperties props = new LeaderboardProperties("test-", 10, 7, "queue", 10, 60, 1000, 10000L, 1000, 5000L, 15);
        IdempotencyRepository repo = new IdempotencyRepository(dynamo, props);

        Instant now = Instant.parse("2026-04-16T12:00:00Z");
        boolean acquired = repo.acquire("sub-1", now);
        assertTrue(acquired);
        verify(dynamo).putItem(any(PutItemRequest.class));

        boolean completed = repo.complete("sub-1");
        assertTrue(completed);
        verify(dynamo).updateItem(any(UpdateItemRequest.class));
    }
}
