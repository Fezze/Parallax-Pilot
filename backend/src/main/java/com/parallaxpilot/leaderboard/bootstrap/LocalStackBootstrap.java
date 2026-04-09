package com.parallaxpilot.leaderboard.bootstrap;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.parallaxpilot.leaderboard.config.LeaderboardProperties;
import jakarta.annotation.PostConstruct;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeDefinition;
import software.amazon.awssdk.services.dynamodb.model.BillingMode;
import software.amazon.awssdk.services.dynamodb.model.CreateTableRequest;
import software.amazon.awssdk.services.dynamodb.model.KeySchemaElement;
import software.amazon.awssdk.services.dynamodb.model.KeyType;
import software.amazon.awssdk.services.dynamodb.model.ResourceNotFoundException;
import software.amazon.awssdk.services.dynamodb.model.ScalarAttributeType;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;
import software.amazon.awssdk.services.sqs.SqsClient;

@Component
@Profile("local")
public class LocalStackBootstrap {

    private final DynamoDbClient dynamoDbClient;
    private final SqsClient sqsClient;
    private final S3Client s3Client;
    private final LeaderboardProperties properties;

    public LocalStackBootstrap(
        DynamoDbClient dynamoDbClient,
        SqsClient sqsClient,
        S3Client s3Client,
        LeaderboardProperties properties
    ) {
        this.dynamoDbClient = dynamoDbClient;
        this.sqsClient = sqsClient;
        this.s3Client = s3Client;
        this.properties = properties;
    }

    @PostConstruct
    void bootstrap() {
        createTableIfMissing(properties.tablePrefix() + "score_submissions");
        createTableIfMissing(properties.tablePrefix() + "best_scores");
        createTableIfMissing(properties.tablePrefix() + "leaderboard_entries");
        createQueueIfMissing(properties.tablePrefix() + "score-submissions");
        createBucketIfMissing(properties.tablePrefix() + "leaderboard-snapshots");
    }

    private void createTableIfMissing(String tableName) {
        try {
            dynamoDbClient.describeTable(builder -> builder.tableName(tableName));
        } catch (ResourceNotFoundException error) {
            dynamoDbClient.createTable(CreateTableRequest.builder()
                .tableName(tableName)
                .billingMode(BillingMode.PAY_PER_REQUEST)
                .attributeDefinitions(
                    AttributeDefinition.builder().attributeName("pk").attributeType(ScalarAttributeType.S).build(),
                    AttributeDefinition.builder().attributeName("sk").attributeType(ScalarAttributeType.S).build()
                )
                .keySchema(
                    KeySchemaElement.builder().attributeName("pk").keyType(KeyType.HASH).build(),
                    KeySchemaElement.builder().attributeName("sk").keyType(KeyType.RANGE).build()
                )
                .build());
        }
    }

    private void createQueueIfMissing(String queueName) {
        var queues = sqsClient.listQueues().queueUrls();
        var present = queues.stream().anyMatch(url -> url.endsWith("/" + queueName));
        if (!present) {
            sqsClient.createQueue(builder -> builder.queueName(queueName));
        }
    }

    private void createBucketIfMissing(String bucketName) {
        try {
            s3Client.headBucket(HeadBucketRequest.builder().bucket(bucketName).build());
        } catch (Exception error) {
            s3Client.createBucket(CreateBucketRequest.builder().bucket(bucketName).build());
        }
    }
}
