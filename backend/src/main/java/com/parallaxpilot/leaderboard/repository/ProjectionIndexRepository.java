package com.parallaxpilot.leaderboard.repository;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.domain.LeaderboardKeys;
import com.parallaxpilot.leaderboard.domain.ProjectionIndexRecord;
import com.parallaxpilot.leaderboard.domain.ScopeKind;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;

@Component
public class ProjectionIndexRepository {

    private final DynamoDbClient dynamoDbClient;
    private final ObjectMapper objectMapper;
    private final LeaderboardProperties properties;

    public ProjectionIndexRepository(DynamoDbClient dynamoDbClient, ObjectMapper objectMapper, LeaderboardProperties properties) {
        this.dynamoDbClient = dynamoDbClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public Optional<ProjectionIndexRecord> get(String playerId, ScopeKind scopeKind, String scopeKey) {
        var response = dynamoDbClient.getItem(GetItemRequest.builder()
            .tableName(properties.tablePrefix() + LeaderboardTables.PROJECTION_INDEX)
            .key(Map.of(
                DynamoDbAttributes.PK, AttributeValue.fromS(playerId),
                DynamoDbAttributes.SK, AttributeValue.fromS(key(scopeKind, scopeKey))
            ))
            .build());

        if (!response.hasItem()) {
            return Optional.empty();
        }

        return Optional.of(readJson(response.item().get(DynamoDbAttributes.PAYLOAD).s(), ProjectionIndexRecord.class));
    }

    public void put(String playerId, ScopeKind scopeKind, String scopeKey, String leaderboardSortKey) {
        var record = new ProjectionIndexRecord(playerId, scopeKind, scopeKey, leaderboardSortKey);
        var item = new HashMap<String, AttributeValue>();
        item.put(DynamoDbAttributes.PK, AttributeValue.fromS(playerId));
        item.put(DynamoDbAttributes.SK, AttributeValue.fromS(key(scopeKind, scopeKey)));
        item.put(DynamoDbAttributes.PAYLOAD, AttributeValue.fromS(writeJson(record)));

        dynamoDbClient.putItem(PutItemRequest.builder()
            .tableName(properties.tablePrefix() + LeaderboardTables.PROJECTION_INDEX)
            .item(item)
            .build());
    }

    public boolean putIfMatches(String playerId, ScopeKind scopeKind, String scopeKey, String leaderboardSortKey, ProjectionIndexRecord expected) {
        var record = new ProjectionIndexRecord(playerId, scopeKind, scopeKey, leaderboardSortKey);
        var item = new HashMap<String, AttributeValue>();
        item.put(DynamoDbAttributes.PK, AttributeValue.fromS(playerId));
        item.put(DynamoDbAttributes.SK, AttributeValue.fromS(key(scopeKind, scopeKey)));
        item.put(DynamoDbAttributes.PAYLOAD, AttributeValue.fromS(writeJson(record)));

        var builder = PutItemRequest.builder()
            .tableName(properties.tablePrefix() + LeaderboardTables.PROJECTION_INDEX)
            .item(item);

        if (expected == null) {
            builder = builder.conditionExpression("attribute_not_exists(" + DynamoDbAttributes.PK + ")");
        } else {
            var expectedJson = writeJson(expected);
            builder = builder
                .conditionExpression("attribute_not_exists(" + DynamoDbAttributes.PK + ") OR #payload = :expected")
                .expressionAttributeNames(Map.of("#payload", DynamoDbAttributes.PAYLOAD))
                .expressionAttributeValues(Map.of(":expected", AttributeValue.fromS(expectedJson)));
        }

        try {
            dynamoDbClient.putItem(builder.build());
            return true;
        } catch (ConditionalCheckFailedException e) {
            return false;
        }
    }

    public void delete(String playerId, ScopeKind scopeKind, String scopeKey) {
        dynamoDbClient.deleteItem(DeleteItemRequest.builder()
            .tableName(properties.tablePrefix() + LeaderboardTables.PROJECTION_INDEX)
            .key(Map.of(
                DynamoDbAttributes.PK, AttributeValue.fromS(playerId),
                DynamoDbAttributes.SK, AttributeValue.fromS(key(scopeKind, scopeKey))
            ))
            .build());
    }

    public void clearTable() {
        var table = properties.tablePrefix() + LeaderboardTables.PROJECTION_INDEX;
        Map<String, AttributeValue> lastKey = null;
        do {
            var req = ScanRequest.builder().tableName(table);
            if (lastKey != null && !lastKey.isEmpty()) {
                req = req.exclusiveStartKey(lastKey);
            }
            var resp = dynamoDbClient.scan(req.build());
            for (var item : resp.items()) {
                dynamoDbClient.deleteItem(DeleteItemRequest.builder()
                    .tableName(table)
                    .key(Map.of(
                        DynamoDbAttributes.PK, item.get(DynamoDbAttributes.PK),
                        DynamoDbAttributes.SK, item.get(DynamoDbAttributes.SK)
                    ))
                    .build());
            }
            lastKey = resp.lastEvaluatedKey();
        } while (lastKey != null && !lastKey.isEmpty());
    }

    private String key(ScopeKind scopeKind, String scopeKey) {
        return LeaderboardKeys.scopePartitionKey(scopeKind, scopeKey);
    }

    private <T> T readJson(String value, Class<T> type) {
        try {
            return objectMapper.readValue(value, type);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Failed to deserialize projection index", error);
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Failed to serialize projection index", error);
        }
    }
}
