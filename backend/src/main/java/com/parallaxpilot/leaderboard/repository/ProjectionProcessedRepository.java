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
public class ProjectionProcessedRepository {

    private final DynamoDbClient dynamoDbClient;
    private final LeaderboardProperties properties;

    public ProjectionProcessedRepository(DynamoDbClient dynamoDbClient, LeaderboardProperties properties) {
        this.dynamoDbClient = dynamoDbClient;
        this.properties = properties;
    }

    /**
     * Attempt to record that a projection for submissionId is being/has been processed.
     * Returns true when the record was created (first time), false when it already existed.
     */
    public boolean acquire(String submissionId, Instant processedAt) {
        var expiresAt = processedAt.plus(properties.idempotencyTtlDays(), ChronoUnit.DAYS).getEpochSecond();

        try {
            dynamoDbClient.putItem(PutItemRequest.builder()
                .tableName(properties.tablePrefix() + LeaderboardTables.PROJECTION_PROCESSED)
                .item(Map.of(
                    DynamoDbAttributes.PK, AttributeValue.fromS(LeaderboardKeys.SUBMISSION_PARTITION),
                    DynamoDbAttributes.SK, AttributeValue.fromS(submissionId),
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
}
