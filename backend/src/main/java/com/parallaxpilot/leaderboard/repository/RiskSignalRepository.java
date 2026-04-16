package com.parallaxpilot.leaderboard.repository;

import java.util.HashMap;
import java.util.Map;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.domain.RiskSignalRecord;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;

@Component
public class RiskSignalRepository {

    private final DynamoDbClient dynamoDbClient;
    private final ObjectMapper objectMapper;
    private final LeaderboardProperties properties;

    public RiskSignalRepository(DynamoDbClient dynamoDbClient, ObjectMapper objectMapper, LeaderboardProperties properties) {
        this.dynamoDbClient = dynamoDbClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public void put(RiskSignalRecord signal) {
        var item = new HashMap<String, AttributeValue>();
        item.put(DynamoDbAttributes.PK, AttributeValue.fromS(signal.submissionId()));
        item.put(DynamoDbAttributes.SK, AttributeValue.fromS(signal.reason()));
        item.put(DynamoDbAttributes.PAYLOAD, AttributeValue.fromS(writeJson(signal)));
        item.put(DynamoDbAttributes.CREATED_AT, AttributeValue.fromS(signal.createdAt().toString()));

        dynamoDbClient.putItem(PutItemRequest.builder()
            .tableName(properties.tablePrefix() + LeaderboardTables.RISK_SIGNALS)
            .item(item)
            .build());
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Failed to serialize risk signal", error);
        }
    }
}
