package com.parallaxpilot.leaderboard.repository;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import com.parallaxpilot.leaderboard.domain.ScoreSubmission;
import com.parallaxpilot.leaderboard.domain.LeaderboardKeys;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import java.util.List;
import java.util.ArrayList;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;

@Component
public class ScoreSubmissionRepository {

    private final DynamoDbClient dynamoDbClient;
    private final ObjectMapper objectMapper;
    private final LeaderboardProperties properties;

    public ScoreSubmissionRepository(DynamoDbClient dynamoDbClient, ObjectMapper objectMapper, LeaderboardProperties properties) {
        this.dynamoDbClient = dynamoDbClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public void put(ScoreSubmission submission) {
        var item = new HashMap<String, AttributeValue>();
        item.put(DynamoDbAttributes.PK, AttributeValue.fromS(LeaderboardKeys.SUBMISSION_PARTITION));
        item.put(DynamoDbAttributes.SK, AttributeValue.fromS(submission.submissionId()));
        item.put(DynamoDbAttributes.PAYLOAD, AttributeValue.fromS(writeJson(submission)));
        item.put(DynamoDbAttributes.SCORE, AttributeValue.fromN(Integer.toString(submission.score())));
        item.put(DynamoDbAttributes.SURVIVED_MS, AttributeValue.fromN(Long.toString(submission.survivedMs())));
        item.put(DynamoDbAttributes.PLAYED_AT, AttributeValue.fromS(submission.playedAt().toString()));

        dynamoDbClient.putItem(PutItemRequest.builder()
            .tableName(properties.tablePrefix() + LeaderboardTables.SCORE_SUBMISSIONS)
            .item(item)
            .build());
    }

    public Optional<ScoreSubmission> get(String submissionId) {
        var response = dynamoDbClient.getItem(GetItemRequest.builder()
            .tableName(properties.tablePrefix() + LeaderboardTables.SCORE_SUBMISSIONS)
            .key(Map.of(
                DynamoDbAttributes.PK, AttributeValue.fromS(LeaderboardKeys.SUBMISSION_PARTITION),
                DynamoDbAttributes.SK, AttributeValue.fromS(submissionId)
            ))
            .build());

        if (!response.hasItem()) {
            return Optional.empty();
        }

        return Optional.of(readJson(response.item().get(DynamoDbAttributes.PAYLOAD).s(), ScoreSubmission.class));
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Failed to serialize score submission", error);
        }
    }

    public List<ScoreSubmission> scanAll() {
        var table = properties.tablePrefix() + LeaderboardTables.SCORE_SUBMISSIONS;
        var result = new ArrayList<ScoreSubmission>();
        Map<String, AttributeValue> lastKey = null;
        do {
            var request = QueryRequest.builder()
                .tableName(table)
                .keyConditionExpression(DynamoDbAttributes.PK + " = :pk")
                .expressionAttributeValues(Map.of(":pk", AttributeValue.fromS(LeaderboardKeys.SUBMISSION_PARTITION)));
            if (lastKey != null && !lastKey.isEmpty()) {
                request.exclusiveStartKey(lastKey);
            }

            var response = dynamoDbClient.query(request.build());
            for (var item : response.items()) {
                var payload = item.get(DynamoDbAttributes.PAYLOAD).s();
                result.add(readJson(payload, ScoreSubmission.class));
            }
            lastKey = response.lastEvaluatedKey();
        } while (lastKey != null && !lastKey.isEmpty());
        return result;
    }

    private <T> T readJson(String value, Class<T> type) {
        try {
            return objectMapper.readValue(value, type);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Failed to deserialize score submission", error);
        }
    }
}
