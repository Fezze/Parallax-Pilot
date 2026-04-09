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
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;

@Component
public class IdempotencyRepository {

    private final DynamoDbClient dynamoDbClient;
    private final LeaderboardProperties properties;

    public IdempotencyRepository(DynamoDbClient dynamoDbClient, LeaderboardProperties properties) {
        this.dynamoDbClient = dynamoDbClient;
        this.properties = properties;
    }

    public boolean acquire(String submissionId, Instant createdAt) {
        var expiresAt = createdAt.plus(properties.idempotencyTtlDays(), ChronoUnit.DAYS).getEpochSecond();

        try {
            dynamoDbClient.putItem(PutItemRequest.builder()
                .tableName(properties.tablePrefix() + LeaderboardTables.IDEMPOTENCY)
                .item(Map.of(
                    DynamoDbAttributes.PK, AttributeValue.fromS(LeaderboardKeys.SUBMISSION_PARTITION),
                    DynamoDbAttributes.SK, AttributeValue.fromS(submissionId),
                    DynamoDbAttributes.CREATED_AT, AttributeValue.fromS(createdAt.toString()),
                    DynamoDbAttributes.EXPIRES_AT, AttributeValue.fromN(Long.toString(expiresAt))
                ))
                .conditionExpression("attribute_not_exists(" + DynamoDbAttributes.PK + ")")
                .build());
            return true;
        } catch (ConditionalCheckFailedException error) {
            return false;
        }
    }
}
