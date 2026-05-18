package com.parallaxpilot.leaderboard.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.domain.LeaderboardEntry;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;

@Component
public class LeaderboardEntryRepository {

    private final DynamoDbClient dynamoDbClient;
    private final ObjectMapper objectMapper;
    private final LeaderboardProperties properties;

    public LeaderboardEntryRepository(DynamoDbClient dynamoDbClient, ObjectMapper objectMapper, LeaderboardProperties properties) {
        this.dynamoDbClient = dynamoDbClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public boolean putIfNotExists(String partitionKey, String sortKey, LeaderboardEntry entry) {
        var item = new HashMap<String, AttributeValue>();
        item.put(DynamoDbAttributes.PK, AttributeValue.fromS(partitionKey));
        item.put(DynamoDbAttributes.SK, AttributeValue.fromS(sortKey));
        item.put(DynamoDbAttributes.PAYLOAD, AttributeValue.fromS(writeJson(entry)));
        item.put(DynamoDbAttributes.SCORE, AttributeValue.fromN(Integer.toString(entry.score())));
        item.put(DynamoDbAttributes.SURVIVED_MS, AttributeValue.fromN(Long.toString(entry.survivedMs())));
        item.put(DynamoDbAttributes.PLAYED_AT, AttributeValue.fromS(entry.playedAt().toString()));

        try {
            dynamoDbClient.putItem(PutItemRequest.builder()
                .tableName(properties.tablePrefix() + LeaderboardTables.LEADERBOARD_ENTRIES)
                .item(item)
                .conditionExpression("attribute_not_exists(" + DynamoDbAttributes.PK + ")")
                .build());
            return true;
        } catch (ConditionalCheckFailedException e) {
            return false;
        }
    }

    public void delete(String partitionKey, String sortKey) {
        dynamoDbClient.deleteItem(DeleteItemRequest.builder()
            .tableName(properties.tablePrefix() + LeaderboardTables.LEADERBOARD_ENTRIES)
            .key(Map.of(
                DynamoDbAttributes.PK, AttributeValue.fromS(partitionKey),
                DynamoDbAttributes.SK, AttributeValue.fromS(sortKey)
            ))
            .build());
    }

    public List<LeaderboardEntry> queryByPartitionKey(String partitionKey, int limit) {
        var response = dynamoDbClient.query(QueryRequest.builder()
            .tableName(properties.tablePrefix() + LeaderboardTables.LEADERBOARD_ENTRIES)
            .keyConditionExpression(DynamoDbAttributes.PK + " = :pk")
            .expressionAttributeValues(Map.of(":pk", AttributeValue.fromS(partitionKey)))
            .limit(limit)
            .scanIndexForward(true)
            .build());

        return response.items().stream()
            .map(item -> readJson(item.get(DynamoDbAttributes.PAYLOAD).s()))
            .toList();
    }

    public void clearTable() {
        var table = properties.tablePrefix() + LeaderboardTables.LEADERBOARD_ENTRIES;
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

    private LeaderboardEntry readJson(String value) {
        try {
            return objectMapper.readValue(value, LeaderboardEntry.class);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Failed to deserialize leaderboard entry", error);
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Failed to serialize leaderboard entry", error);
        }
    }
}
