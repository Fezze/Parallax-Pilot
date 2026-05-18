package com.parallaxpilot.leaderboard.repository;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.domain.LeaderboardKeys;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;

@Component
public class ProjectionProcessedRepository {

    private final DynamoDbClient dynamoDbClient;
    private final LeaderboardProperties properties;

    public ProjectionProcessedRepository(DynamoDbClient dynamoDbClient, LeaderboardProperties properties) {
        this.dynamoDbClient = dynamoDbClient;
        this.properties = properties;
    }

    /**
     * Backward-compatible alias for callers that still pass a fully scoped projection key.
     */
    public boolean acquire(String submissionId, Instant processedAt) {
        return markProcessed(submissionId, processedAt);
    }

    public boolean hasProcessed(String projectionKey) {
        var response = dynamoDbClient.getItem(GetItemRequest.builder()
            .tableName(properties.tablePrefix() + LeaderboardTables.PROJECTION_PROCESSED)
            .key(Map.of(
                DynamoDbAttributes.PK, AttributeValue.fromS(LeaderboardKeys.SUBMISSION_PARTITION),
                DynamoDbAttributes.SK, AttributeValue.fromS(projectionKey)
            ))
            .build());

        return response.hasItem();
    }

    public boolean markProcessed(String projectionKey, Instant processedAt) {
        var expiresAt = processedAt.plus(properties.idempotencyTtlDays(), ChronoUnit.DAYS).getEpochSecond();

        try {
            dynamoDbClient.putItem(PutItemRequest.builder()
                .tableName(properties.tablePrefix() + LeaderboardTables.PROJECTION_PROCESSED)
                .item(Map.of(
                    DynamoDbAttributes.PK, AttributeValue.fromS(LeaderboardKeys.SUBMISSION_PARTITION),
                    DynamoDbAttributes.SK, AttributeValue.fromS(projectionKey),
                    DynamoDbAttributes.CREATED_AT, AttributeValue.fromS(processedAt.toString()),
                    DynamoDbAttributes.EXPIRES_AT, AttributeValue.fromN(Long.toString(expiresAt))
                ))
                .conditionExpression("attribute_not_exists(" + DynamoDbAttributes.PK + ")")
                .build());
            return true;
        } catch (ConditionalCheckFailedException error) {
            return false;
        }
    }

    public void clearTable() {
        var table = properties.tablePrefix() + LeaderboardTables.PROJECTION_PROCESSED;
        Map<String, AttributeValue> lastKey = null;
        do {
            var request = ScanRequest.builder().tableName(table);
            if (lastKey != null && !lastKey.isEmpty()) {
                request = request.exclusiveStartKey(lastKey);
            }

            var response = dynamoDbClient.scan(request.build());
            for (var item : response.items()) {
                dynamoDbClient.deleteItem(DeleteItemRequest.builder()
                    .tableName(table)
                    .key(Map.of(
                        DynamoDbAttributes.PK, item.get(DynamoDbAttributes.PK),
                        DynamoDbAttributes.SK, item.get(DynamoDbAttributes.SK)
                    ))
                    .build());
            }
            lastKey = response.lastEvaluatedKey();
        } while (lastKey != null && !lastKey.isEmpty());
    }
}
