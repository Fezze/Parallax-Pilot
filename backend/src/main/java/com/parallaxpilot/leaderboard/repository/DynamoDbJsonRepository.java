package com.parallaxpilot.leaderboard.repository;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;

@Component
public class DynamoDbJsonRepository {

    private final DynamoDbClient dynamoDbClient;
    private final ObjectMapper objectMapper;
    private final LeaderboardProperties properties;

    public DynamoDbJsonRepository(
        DynamoDbClient dynamoDbClient,
        ObjectMapper objectMapper,
        LeaderboardProperties properties
    ) {
        this.dynamoDbClient = dynamoDbClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public <T> void put(String tableSuffix, String pk, String sk, T payload) {
        var item = new HashMap<String, AttributeValue>();
        item.put("pk", AttributeValue.fromS(pk));
        item.put("sk", AttributeValue.fromS(sk));
        item.put("payload", AttributeValue.fromS(writeJson(payload)));

        dynamoDbClient.putItem(PutItemRequest.builder()
            .tableName(tableName(tableSuffix))
            .item(item)
            .build());
    }

    public <T> Optional<T> get(String tableSuffix, String pk, String sk, Class<T> type) {
        var response = dynamoDbClient.getItem(GetItemRequest.builder()
            .tableName(tableName(tableSuffix))
            .key(Map.of(
                "pk", AttributeValue.fromS(pk),
                "sk", AttributeValue.fromS(sk)
            ))
            .build());

        if (!response.hasItem()) {
            return Optional.empty();
        }

        return Optional.of(readJson(response.item().get("payload").s(), type));
    }

    public <T> List<T> queryByPartitionKey(String tableSuffix, String pk, Class<T> type, int limit) {
        var response = dynamoDbClient.query(QueryRequest.builder()
            .tableName(tableName(tableSuffix))
            .keyConditionExpression("pk = :pk")
            .expressionAttributeValues(Map.of(":pk", AttributeValue.fromS(pk)))
            .limit(limit)
            .scanIndexForward(true)
            .build());

        return response.items().stream()
            .map(item -> readJson(item.get("payload").s(), type))
            .toList();
    }

    private String tableName(String suffix) {
        return properties.tablePrefix() + suffix;
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Failed to serialize payload", error);
        }
    }

    private <T> T readJson(String value, Class<T> type) {
        try {
            return objectMapper.readValue(value, type);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Failed to deserialize payload", error);
        }
    }
}
