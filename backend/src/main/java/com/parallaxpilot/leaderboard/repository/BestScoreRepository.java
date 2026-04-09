package com.parallaxpilot.leaderboard.repository;

import java.util.HashMap;
import java.util.Map;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.domain.BestScoreRecord;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;

@Component
public class BestScoreRepository {

    private final DynamoDbClient dynamoDbClient;
    private final ObjectMapper objectMapper;
    private final LeaderboardProperties properties;

    public BestScoreRepository(
        DynamoDbClient dynamoDbClient,
        ObjectMapper objectMapper,
        LeaderboardProperties properties
    ) {
        this.dynamoDbClient = dynamoDbClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public boolean putIfBetter(BestScoreRecord record) {
        var item = new HashMap<String, AttributeValue>();
        item.put("pk", AttributeValue.fromS(record.playerId()));
        item.put("sk", AttributeValue.fromS(record.scopeKind().name() + "#" + record.scopeKey()));
        item.put("payload", AttributeValue.fromS(writeJson(record)));
        item.put("score", AttributeValue.fromN(Integer.toString(record.score())));
        item.put("survivedMs", AttributeValue.fromN(Long.toString(record.survivedMs())));
        item.put("playedAt", AttributeValue.fromS(record.playedAt().toString()));

        try {
            dynamoDbClient.putItem(PutItemRequest.builder()
                .tableName(properties.tablePrefix() + "best_scores")
                .item(item)
                .conditionExpression(
                    "attribute_not_exists(pk) OR #score < :score OR "
                        + "(#score = :score AND #survivedMs < :survivedMs) OR "
                        + "(#score = :score AND #survivedMs = :survivedMs AND #playedAt > :playedAt)"
                )
                .expressionAttributeNames(Map.of(
                    "#score", "score",
                    "#survivedMs", "survivedMs",
                    "#playedAt", "playedAt"
                ))
                .expressionAttributeValues(Map.of(
                    ":score", AttributeValue.fromN(Integer.toString(record.score())),
                    ":survivedMs", AttributeValue.fromN(Long.toString(record.survivedMs())),
                    ":playedAt", AttributeValue.fromS(record.playedAt().toString())
                ))
                .build());
            return true;
        } catch (ConditionalCheckFailedException error) {
            return false;
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Failed to serialize best score", error);
        }
    }
}
