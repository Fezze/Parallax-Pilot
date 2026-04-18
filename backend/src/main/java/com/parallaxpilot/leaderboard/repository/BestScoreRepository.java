package com.parallaxpilot.leaderboard.repository;

import java.util.HashMap;
import java.util.Map;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.domain.BestScoreRecord;
import com.parallaxpilot.leaderboard.domain.LeaderboardKeys;
import com.parallaxpilot.leaderboard.domain.ScopeKind;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import java.util.Optional;
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
        item.put(DynamoDbAttributes.PK, AttributeValue.fromS(record.playerId()));
        item.put(DynamoDbAttributes.SK, AttributeValue.fromS(LeaderboardKeys.scopePartitionKey(record.scopeKind(), record.scopeKey())));
        item.put(DynamoDbAttributes.PAYLOAD, AttributeValue.fromS(writeJson(record)));
        item.put(DynamoDbAttributes.SCORE, AttributeValue.fromN(Integer.toString(record.score())));
        item.put(DynamoDbAttributes.SURVIVED_MS, AttributeValue.fromN(Long.toString(record.survivedMs())));
        item.put(DynamoDbAttributes.PLAYED_AT, AttributeValue.fromS(record.playedAt().toString()));

        try {
            dynamoDbClient.putItem(PutItemRequest.builder()
                .tableName(properties.tablePrefix() + LeaderboardTables.BEST_SCORES)
                .item(item)
                .conditionExpression(
                    "attribute_not_exists(" + DynamoDbAttributes.PK + ") OR #score < :score OR "
                        + "(#score = :score AND #survivedMs < :survivedMs) OR "
                        + "(#score = :score AND #survivedMs = :survivedMs AND #playedAt > :playedAt)"
                )
                .expressionAttributeNames(Map.of(
                    "#score", DynamoDbAttributes.SCORE,
                    "#survivedMs", DynamoDbAttributes.SURVIVED_MS,
                    "#playedAt", DynamoDbAttributes.PLAYED_AT
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

    public Optional<BestScoreRecord> get(String playerId, ScopeKind scopeKind, String scopeKey) {
        var response = dynamoDbClient.getItem(GetItemRequest.builder()
            .tableName(properties.tablePrefix() + LeaderboardTables.BEST_SCORES)
            .key(Map.of(
                DynamoDbAttributes.PK, AttributeValue.fromS(playerId),
                DynamoDbAttributes.SK, AttributeValue.fromS(LeaderboardKeys.scopePartitionKey(scopeKind, scopeKey))
            ))
            .build());

        if (!response.hasItem()) {
            return Optional.empty();
        }

        var payload = response.item().get(DynamoDbAttributes.PAYLOAD).s();
        return Optional.of(readJson(payload, BestScoreRecord.class));
    }

    private <T> T readJson(String value, Class<T> type) {
        try {
            return objectMapper.readValue(value, type);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Failed to deserialize best score", error);
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Failed to serialize best score", error);
        }
    }

    public void clearTable() {
        var table = properties.tablePrefix() + LeaderboardTables.BEST_SCORES;
        var scan = dynamoDbClient.scan(ScanRequest.builder().tableName(table).build());
        for (var item : scan.items()) {
            dynamoDbClient.deleteItem(DeleteItemRequest.builder()
                .tableName(table)
                .key(Map.of(
                    DynamoDbAttributes.PK, item.get(DynamoDbAttributes.PK),
                    DynamoDbAttributes.SK, item.get(DynamoDbAttributes.SK)
                ))
                .build());
        }
    }
}
