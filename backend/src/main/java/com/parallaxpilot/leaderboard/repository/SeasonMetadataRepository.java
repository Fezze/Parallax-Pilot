package com.parallaxpilot.leaderboard.repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.domain.SeasonMetadataRecord;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;

@Component
public class SeasonMetadataRepository {

    private final DynamoDbClient dynamoDbClient;
    private final ObjectMapper objectMapper;
    private final LeaderboardProperties properties;

    public SeasonMetadataRepository(DynamoDbClient dynamoDbClient, ObjectMapper objectMapper, LeaderboardProperties properties) {
        this.dynamoDbClient = dynamoDbClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public List<SeasonMetadataRecord> findAll() {
        var table = properties.tablePrefix() + LeaderboardTables.SEASON_METADATA;
        var items = new ArrayList<SeasonMetadataRecord>();
        Map<String, AttributeValue> lastKey = null;

        do {
            var req = ScanRequest.builder().tableName(table);
            if (lastKey != null && !lastKey.isEmpty()) {
                req = req.exclusiveStartKey(lastKey);
            }

            var resp = dynamoDbClient.scan(req.build());
            for (var item : resp.items()) {
                items.add(readJson(item.get(DynamoDbAttributes.PAYLOAD).s(), SeasonMetadataRecord.class));
            }
            lastKey = resp.lastEvaluatedKey();
        } while (lastKey != null && !lastKey.isEmpty());

        return items;
    }

    public void put(SeasonMetadataRecord record) {
        var table = properties.tablePrefix() + LeaderboardTables.SEASON_METADATA;
        dynamoDbClient.putItem(PutItemRequest.builder()
            .tableName(table)
            .item(Map.of(
                DynamoDbAttributes.PK, AttributeValue.fromS(LeaderboardKeys.SEASON_PARTITION),
                DynamoDbAttributes.SK, AttributeValue.fromS(record.seasonKey()),
                DynamoDbAttributes.PAYLOAD, AttributeValue.fromS(writeJson(record))
            ))
            .build());
    }

    private <T> T readJson(String value, Class<T> type) {
        try {
            return objectMapper.readValue(value, type);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Failed to deserialize season metadata", error);
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Failed to serialize season metadata", error);
        }
    }
}
