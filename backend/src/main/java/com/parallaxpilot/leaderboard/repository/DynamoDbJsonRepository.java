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
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;

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
        item.put(DynamoDbAttributes.PK, AttributeValue.fromS(pk));
        item.put(DynamoDbAttributes.SK, AttributeValue.fromS(sk));
        item.put(DynamoDbAttributes.PAYLOAD, AttributeValue.fromS(writeJson(payload)));

        dynamoDbClient.putItem(PutItemRequest.builder()
            .tableName(tableName(tableSuffix))
            .item(item)
            .build());
    }

    public <T> boolean putIfNotExists(String tableSuffix, String pk, String sk, T payload) {
        var item = new HashMap<String, AttributeValue>();
        item.put(DynamoDbAttributes.PK, AttributeValue.fromS(pk));
        item.put(DynamoDbAttributes.SK, AttributeValue.fromS(sk));
        item.put(DynamoDbAttributes.PAYLOAD, AttributeValue.fromS(writeJson(payload)));

        try {
            dynamoDbClient.putItem(PutItemRequest.builder()
                .tableName(tableName(tableSuffix))
                .item(item)
                .conditionExpression("attribute_not_exists(" + DynamoDbAttributes.PK + ")")
                .build());
            return true;
        } catch (ConditionalCheckFailedException e) {
            return false;
        }
    }

    public <T> boolean putIfMatches(String tableSuffix, String pk, String sk, T payload, Object expectedPayload) {
        var item = new HashMap<String, AttributeValue>();
        item.put(DynamoDbAttributes.PK, AttributeValue.fromS(pk));
        item.put(DynamoDbAttributes.SK, AttributeValue.fromS(sk));
        item.put(DynamoDbAttributes.PAYLOAD, AttributeValue.fromS(writeJson(payload)));

        var builder = PutItemRequest.builder()
            .tableName(tableName(tableSuffix))
            .item(item);

        if (expectedPayload == null) {
            builder = builder.conditionExpression("attribute_not_exists(" + DynamoDbAttributes.PK + ")");
        } else {
            var expectedJson = writeJson(expectedPayload);
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

    public <T> Optional<T> get(String tableSuffix, String pk, String sk, Class<T> type) {
        var response = dynamoDbClient.getItem(GetItemRequest.builder()
            .tableName(tableName(tableSuffix))
            .key(Map.of(
                DynamoDbAttributes.PK, AttributeValue.fromS(pk),
                DynamoDbAttributes.SK, AttributeValue.fromS(sk)
            ))
            .build());

        if (!response.hasItem()) {
            return Optional.empty();
        }

        return Optional.of(readJson(response.item().get(DynamoDbAttributes.PAYLOAD).s(), type));
    }

    public <T> List<T> queryByPartitionKey(String tableSuffix, String pk, Class<T> type, int limit) {
        var response = dynamoDbClient.query(QueryRequest.builder()
            .tableName(tableName(tableSuffix))
            .keyConditionExpression(DynamoDbAttributes.PK + " = :pk")
            .expressionAttributeValues(Map.of(":pk", AttributeValue.fromS(pk)))
            .limit(limit)
            .scanIndexForward(true)
            .build());

        return response.items().stream()
            .map(item -> readJson(item.get(DynamoDbAttributes.PAYLOAD).s(), type))
            .toList();
    }

    public <T> List<T> scanAll(String tableSuffix, Class<T> type) {
        var items = new java.util.ArrayList<T>();
        Map<String, AttributeValue> lastEvaluatedKey = null;

        do {
            var request = ScanRequest.builder().tableName(tableName(tableSuffix));
            if (lastEvaluatedKey != null && !lastEvaluatedKey.isEmpty()) {
                request.exclusiveStartKey(lastEvaluatedKey);
            }

            var response = dynamoDbClient.scan(request.build());
            items.addAll(response.items().stream()
                .map(item -> readJson(item.get(DynamoDbAttributes.PAYLOAD).s(), type))
                .toList());
            lastEvaluatedKey = response.lastEvaluatedKey();
        } while (lastEvaluatedKey != null && !lastEvaluatedKey.isEmpty());

        return items;
    }

    public void delete(String tableSuffix, String pk, String sk) {
        dynamoDbClient.deleteItem(DeleteItemRequest.builder()
            .tableName(tableName(tableSuffix))
            .key(Map.of(
                DynamoDbAttributes.PK, AttributeValue.fromS(pk),
                DynamoDbAttributes.SK, AttributeValue.fromS(sk)
            ))
            .build());
    }

    public void clearTable(String tableSuffix) {
        Map<String, AttributeValue> lastEvaluatedKey = null;
        do {
            var request = ScanRequest.builder()
                .tableName(tableName(tableSuffix))
                .attributesToGet(DynamoDbAttributes.PK, DynamoDbAttributes.SK);
            if (lastEvaluatedKey != null && !lastEvaluatedKey.isEmpty()) {
                request.exclusiveStartKey(lastEvaluatedKey);
            }

            var response = dynamoDbClient.scan(request.build());
            for (var item : response.items()) {
                delete(tableSuffix, item.get(DynamoDbAttributes.PK).s(), item.get(DynamoDbAttributes.SK).s());
            }
            lastEvaluatedKey = response.lastEvaluatedKey();
        } while (lastEvaluatedKey != null && !lastEvaluatedKey.isEmpty());
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
