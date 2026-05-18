package com.parallaxpilot.leaderboard.repository;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemResponse;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;

class RebuildLockRepositoryTest {

    private static LeaderboardProperties properties() {
        return new LeaderboardProperties("test-", 10, 7, 7, "queue", true, 30000L, 10, 60, 1000, 10000L, 1000, 5000L, 15, false, "snapshots");
    }

    @Test
    void tryAcquireWritesLockRow() {
        DynamoDbClient dynamo = mock(DynamoDbClient.class);
        var repository = new RebuildLockRepository(
            dynamo,
            properties(),
            Clock.fixed(Instant.parse("2026-04-19T12:00:00Z"), ZoneOffset.UTC)
        );

        assertTrue(repository.tryAcquire());
        verify(dynamo).putItem(any(PutItemRequest.class));
    }

    @Test
    void isActiveReturnsFalseForExpiredLockRows() {
        DynamoDbClient dynamo = mock(DynamoDbClient.class);
        when(dynamo.getItem(any(GetItemRequest.class))).thenReturn(GetItemResponse.builder()
            .item(Map.of(
                DynamoDbAttributes.PK, AttributeValue.fromS("rebuild-lock"),
                DynamoDbAttributes.SK, AttributeValue.fromS("rebuild-lock"),
                DynamoDbAttributes.EXPIRES_AT, AttributeValue.fromN(Long.toString(Instant.parse("2026-04-19T11:59:00Z").getEpochSecond()))
            ))
            .build());
        var repository = new RebuildLockRepository(
            dynamo,
            properties(),
            Clock.fixed(Instant.parse("2026-04-19T12:00:00Z"), ZoneOffset.UTC)
        );

        assertFalse(repository.isActive());
    }
}