package com.parallaxpilot.leaderboard.repository;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemResponse;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanResponse;

class ProjectionProcessedRepositoryTest {

    private static LeaderboardProperties properties() {
        return new LeaderboardProperties("test-", 10, 7, "queue", 10, 60, 1000, 10000L, 1000, 5000L, 15, false, "snapshots");
    }

    @Test
    void hasProcessedReflectsPresenceOfStoredItem() {
        DynamoDbClient dynamo = mock(DynamoDbClient.class);
        when(dynamo.getItem(any(GetItemRequest.class))).thenReturn(GetItemResponse.builder()
            .item(Map.of(DynamoDbAttributes.PK, AttributeValue.fromS("submission")))
            .build());
        ProjectionProcessedRepository repo = new ProjectionProcessedRepository(dynamo, properties());

        assertTrue(repo.hasProcessed("GLOBAL#global#player-1"));
    }

    @Test
    void markProcessedReturnsFalseWhenConditionalWriteFails() {
        DynamoDbClient dynamo = mock(DynamoDbClient.class);
        org.mockito.Mockito.doThrow(ConditionalCheckFailedException.builder().message("exists").build())
            .when(dynamo)
            .putItem(any(PutItemRequest.class));
        ProjectionProcessedRepository repo = new ProjectionProcessedRepository(dynamo, properties());

        assertFalse(repo.markProcessed("GLOBAL#global#player-1", Instant.parse("2026-04-19T12:00:00Z")));
    }

    @Test
    void clearTableDeletesEveryScannedRowAcrossPages() {
        DynamoDbClient dynamo = mock(DynamoDbClient.class);
        when(dynamo.scan(any(ScanRequest.class)))
            .thenReturn(ScanResponse.builder()
                .items(List.of(Map.of(
                    DynamoDbAttributes.PK, AttributeValue.fromS("submission"),
                    DynamoDbAttributes.SK, AttributeValue.fromS("one")
                )))
                .lastEvaluatedKey(Map.of(DynamoDbAttributes.PK, AttributeValue.fromS("next")))
                .build())
            .thenReturn(ScanResponse.builder()
                .items(List.of(Map.of(
                    DynamoDbAttributes.PK, AttributeValue.fromS("submission"),
                    DynamoDbAttributes.SK, AttributeValue.fromS("two")
                )))
                .build());
        ProjectionProcessedRepository repo = new ProjectionProcessedRepository(dynamo, properties());

        repo.clearTable();

        verify(dynamo, org.mockito.Mockito.times(2)).deleteItem(any(DeleteItemRequest.class));
    }
}