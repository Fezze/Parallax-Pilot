package com.parallaxpilot.leaderboard.repository;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Component;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.domain.LeaderboardKeys;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

@Component
public class IdempotencyRepository {

    private final DynamoDbClient dynamoDbClient;
    private final LeaderboardProperties properties;

    public IdempotencyRepository(DynamoDbClient dynamoDbClient, LeaderboardProperties properties) {
        this.dynamoDbClient = dynamoDbClient;
        this.properties = properties;
    }

    public AcquireResult acquire(String submissionId, Instant createdAt) {
        var expiresAt = createdAt.plus(properties.idempotencyTtlDays(), ChronoUnit.DAYS).getEpochSecond();

        try {
            dynamoDbClient.putItem(PutItemRequest.builder()
                .tableName(properties.tablePrefix() + LeaderboardTables.IDEMPOTENCY)
                .item(Map.of(
                    DynamoDbAttributes.PK, AttributeValue.fromS(LeaderboardKeys.SUBMISSION_PARTITION),
                    DynamoDbAttributes.SK, AttributeValue.fromS(submissionId),
                    DynamoDbAttributes.CREATED_AT, AttributeValue.fromS(createdAt.toString()),
                    DynamoDbAttributes.EXPIRES_AT, AttributeValue.fromN(Long.toString(expiresAt)),
                    DynamoDbAttributes.STATUS, AttributeValue.fromS("ACQUIRED")
                ))
                .conditionExpression("attribute_not_exists(" + DynamoDbAttributes.PK + ")")
                .build());
            return AcquireResult.ACQUIRED;
        } catch (ConditionalCheckFailedException error) {
            return get(submissionId)
                .map(record -> record.status() == IdempotencyStatus.COMPLETED
                    ? AcquireResult.ALREADY_COMPLETED
                    : AcquireResult.ALREADY_ACQUIRED)
                .orElse(AcquireResult.ALREADY_ACQUIRED);
        }
    }

    public Optional<IdempotencyRecord> get(String submissionId) {
        var response = dynamoDbClient.getItem(GetItemRequest.builder()
            .tableName(properties.tablePrefix() + LeaderboardTables.IDEMPOTENCY)
            .key(Map.of(
                DynamoDbAttributes.PK, AttributeValue.fromS(LeaderboardKeys.SUBMISSION_PARTITION),
                DynamoDbAttributes.SK, AttributeValue.fromS(submissionId)
            ))
            .build());

        if (!response.hasItem()) {
            return Optional.empty();
        }

        var item = response.item();
        return Optional.of(new IdempotencyRecord(
            submissionId,
            IdempotencyStatus.valueOf(item.get(DynamoDbAttributes.STATUS).s()),
            Instant.parse(item.get(DynamoDbAttributes.CREATED_AT).s()),
            Instant.ofEpochSecond(Long.parseLong(item.get(DynamoDbAttributes.EXPIRES_AT).n())),
            item.containsKey(DynamoDbAttributes.COMPLETED_AT)
                ? Instant.parse(item.get(DynamoDbAttributes.COMPLETED_AT).s())
                : null
        ));
    }

    public boolean complete(String submissionId, Instant completedAt) {
        try {
            dynamoDbClient.updateItem(UpdateItemRequest.builder()
                .tableName(properties.tablePrefix() + LeaderboardTables.IDEMPOTENCY)
                .key(Map.of(
                    DynamoDbAttributes.PK, AttributeValue.fromS(LeaderboardKeys.SUBMISSION_PARTITION),
                    DynamoDbAttributes.SK, AttributeValue.fromS(submissionId)
                ))
                .updateExpression("SET #status = :completed, #completedAt = :completedAt")
                .expressionAttributeNames(Map.of(
                    "#status", DynamoDbAttributes.STATUS,
                    "#completedAt", DynamoDbAttributes.COMPLETED_AT
                ))
                .expressionAttributeValues(Map.of(
                    ":completed", AttributeValue.fromS(IdempotencyStatus.COMPLETED.name()),
                    ":completedAt", AttributeValue.fromS(completedAt.toString())
                ))
                .conditionExpression("attribute_exists(" + DynamoDbAttributes.PK + ")")
                .build());
            return true;
        } catch (ConditionalCheckFailedException error) {
            return false;
        }
    }

    public enum AcquireResult {
        ACQUIRED,
        ALREADY_ACQUIRED,
        ALREADY_COMPLETED
    }

    public enum IdempotencyStatus {
        ACQUIRED,
        COMPLETED
    }

    public record IdempotencyRecord(
        String submissionId,
        IdempotencyStatus status,
        Instant createdAt,
        Instant expiresAt,
        Instant completedAt
    ) {
    }
}
