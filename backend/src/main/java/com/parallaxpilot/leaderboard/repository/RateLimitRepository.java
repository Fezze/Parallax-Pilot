package com.parallaxpilot.leaderboard.repository;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.domain.LeaderboardKeys;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ReturnValue;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

@Component
public class RateLimitRepository {

    private final DynamoDbClient dynamoDbClient;
    private final LeaderboardProperties properties;

    public RateLimitRepository(DynamoDbClient dynamoDbClient, LeaderboardProperties properties) {
        this.dynamoDbClient = dynamoDbClient;
        this.properties = properties;
    }

    public int incrementPlayerWindow(String playerId, Instant playedAt) {
        var minuteWindow = playedAt.truncatedTo(ChronoUnit.MINUTES).toString();
        var expiresAt = playedAt.plus(5, ChronoUnit.MINUTES).getEpochSecond();

        var response = dynamoDbClient.updateItem(UpdateItemRequest.builder()
            .tableName(properties.tablePrefix() + LeaderboardTables.ABUSE_COUNTERS)
            .key(Map.of(
                DynamoDbAttributes.PK, AttributeValue.fromS(LeaderboardKeys.playerRateLimitPartition(playerId)),
                DynamoDbAttributes.SK, AttributeValue.fromS(minuteWindow)
            ))
            .updateExpression("ADD #count :one SET #expiresAt = :expiresAt")
            .expressionAttributeNames(Map.of(
                "#count", DynamoDbAttributes.COUNT,
                "#expiresAt", DynamoDbAttributes.EXPIRES_AT
            ))
            .expressionAttributeValues(Map.of(
                ":one", AttributeValue.fromN("1"),
                ":expiresAt", AttributeValue.fromN(Long.toString(expiresAt))
            ))
            .returnValues(ReturnValue.UPDATED_NEW)
            .build());

        return Integer.parseInt(response.attributes().get(DynamoDbAttributes.COUNT).n());
    }
}
