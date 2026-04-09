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

@Component
public class RebuildLockRepository {

    private final DynamoDbClient dynamoDbClient;
    private final LeaderboardProperties properties;

    public RebuildLockRepository(DynamoDbClient dynamoDbClient, LeaderboardProperties properties) {
        this.dynamoDbClient = dynamoDbClient;
        this.properties = properties;
    }

    public boolean tryAcquire() {
        var now = Instant.now();
        var expiresAt = now.plus(properties.rebuildLockTtlMinutes(), ChronoUnit.MINUTES).getEpochSecond();

        try {
            dynamoDbClient.putItem(PutItemRequest.builder()
                .tableName(properties.tablePrefix() + LeaderboardTables.ADMIN_STATE)
                .item(Map.of(
                    DynamoDbAttributes.PK, AttributeValue.fromS(LeaderboardKeys.REBUILD_LOCK_PARTITION),
                    DynamoDbAttributes.SK, AttributeValue.fromS(LeaderboardKeys.REBUILD_LOCK_SORT_KEY),
                    DynamoDbAttributes.CREATED_AT, AttributeValue.fromS(now.toString()),
                    DynamoDbAttributes.EXPIRES_AT, AttributeValue.fromN(Long.toString(expiresAt))
                ))
                .conditionExpression("attribute_not_exists(" + DynamoDbAttributes.PK + ")")
                .build());
            return true;
        } catch (ConditionalCheckFailedException error) {
            return false;
        }
    }

    public boolean isActive() {
        var response = dynamoDbClient.getItem(GetItemRequest.builder()
            .tableName(properties.tablePrefix() + LeaderboardTables.ADMIN_STATE)
            .key(Map.of(
                DynamoDbAttributes.PK, AttributeValue.fromS(LeaderboardKeys.REBUILD_LOCK_PARTITION),
                DynamoDbAttributes.SK, AttributeValue.fromS(LeaderboardKeys.REBUILD_LOCK_SORT_KEY)
            ))
            .build());
        return response.hasItem();
    }

    public void release() {
        dynamoDbClient.deleteItem(DeleteItemRequest.builder()
            .tableName(properties.tablePrefix() + LeaderboardTables.ADMIN_STATE)
            .key(Map.of(
                DynamoDbAttributes.PK, AttributeValue.fromS(LeaderboardKeys.REBUILD_LOCK_PARTITION),
                DynamoDbAttributes.SK, AttributeValue.fromS(LeaderboardKeys.REBUILD_LOCK_SORT_KEY)
            ))
            .build());
    }
}
