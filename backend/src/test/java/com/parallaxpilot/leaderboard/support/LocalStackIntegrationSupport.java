package com.parallaxpilot.leaderboard.support;

import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.localstack.LocalStackContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeDefinition;
import software.amazon.awssdk.services.dynamodb.model.BillingMode;
import software.amazon.awssdk.services.dynamodb.model.CreateTableRequest;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.KeySchemaElement;
import software.amazon.awssdk.services.dynamodb.model.KeyType;
import software.amazon.awssdk.services.dynamodb.model.ResourceNotFoundException;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.ScalarAttributeType;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.PurgeQueueInProgressException;

@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
public abstract class LocalStackIntegrationSupport {

    @Container
    static final LocalStackContainer LOCALSTACK = new LocalStackContainer(
        DockerImageName.parse("localstack/localstack:4.1")
    ).withServices(
        LocalStackContainer.Service.DYNAMODB,
        LocalStackContainer.Service.SQS,
        LocalStackContainer.Service.S3
    );

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("aws.region", LOCALSTACK::getRegion);
        registry.add("aws.endpoint", () -> LOCALSTACK.getEndpointOverride(LocalStackContainer.Service.DYNAMODB).toString());
        registry.add("app.leaderboard.table-prefix", () -> "pp_");
        registry.add("app.leaderboard.consumer-fixed-delay-ms", () -> "600000");
    }

    protected static void bootstrapResources() {
        createTableIfMissing("pp_score_submissions");
        createTableIfMissing("pp_best_scores");
        createTableIfMissing("pp_leaderboard_entries");
        createTableIfMissing("pp_projection_index");
        createTableIfMissing("pp_projection_processed");
        createTableIfMissing("pp_idempotency");
        createTableIfMissing("pp_risk_signals");
        createTableIfMissing("pp_season_metadata");
        createTableIfMissing("pp_abuse_counters");
        createTableIfMissing("pp_admin_state");
        createQueueIfMissing("pp_score-submissions");
        createBucketIfMissing("pp-leaderboard-snapshots");
    }

    protected static void resetResources() {
        clearTable("pp_score_submissions");
        clearTable("pp_best_scores");
        clearTable("pp_leaderboard_entries");
        clearTable("pp_projection_index");
        clearTable("pp_projection_processed");
        clearTable("pp_idempotency");
        clearTable("pp_risk_signals");
        clearTable("pp_season_metadata");
        clearTable("pp_abuse_counters");
        clearTable("pp_admin_state");
        purgeQueue("pp_score-submissions");
    }

    private static void createTableIfMissing(String tableName) {
        try (var client = dynamoDbClient()) {
            try {
                client.describeTable(builder -> builder.tableName(tableName));
            } catch (ResourceNotFoundException error) {
                client.createTable(CreateTableRequest.builder()
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
    }

    private static void createQueueIfMissing(String queueName) {
        try (var client = sqsClient()) {
            var queues = client.listQueues().queueUrls();
            var present = queues.stream().anyMatch(url -> url.endsWith("/" + queueName));
            if (!present) {
                client.createQueue(builder -> builder.queueName(queueName));
            }
        }
    }

    private static void purgeQueue(String queueName) {
        try (var client = sqsClient()) {
            try {
                var queueUrl = client.getQueueUrl(builder -> builder.queueName(queueName)).queueUrl();
                client.purgeQueue(builder -> builder.queueUrl(queueUrl));
            } catch (PurgeQueueInProgressException ignored) {
                // LocalStack tests can hit purge twice in a short window; stale messages are acceptable here.
            }
        }
    }

    private static void createBucketIfMissing(String bucketName) {
        try (var client = s3Client()) {
            try {
                client.headBucket(HeadBucketRequest.builder().bucket(bucketName).build());
            } catch (Exception error) {
                client.createBucket(CreateBucketRequest.builder().bucket(bucketName).build());
            }
        }
    }

    private static DynamoDbClient dynamoDbClient() {
        return DynamoDbClient.builder()
            .endpointOverride(LOCALSTACK.getEndpointOverride(LocalStackContainer.Service.DYNAMODB))
            .region(Region.of(LOCALSTACK.getRegion()))
            .credentialsProvider(credentialsProvider())
            .build();
    }

    private static SqsClient sqsClient() {
        return SqsClient.builder()
            .endpointOverride(LOCALSTACK.getEndpointOverride(LocalStackContainer.Service.SQS))
            .region(Region.of(LOCALSTACK.getRegion()))
            .credentialsProvider(credentialsProvider())
            .build();
    }

    private static S3Client s3Client() {
        return S3Client.builder()
            .endpointOverride(LOCALSTACK.getEndpointOverride(LocalStackContainer.Service.S3))
            .region(Region.of(LOCALSTACK.getRegion()))
            .credentialsProvider(credentialsProvider())
            .forcePathStyle(true)
            .build();
    }

    private static StaticCredentialsProvider credentialsProvider() {
        return StaticCredentialsProvider.create(
            AwsBasicCredentials.create(LOCALSTACK.getAccessKey(), LOCALSTACK.getSecretKey())
        );
    }

    private static void clearTable(String tableName) {
        try (var client = dynamoDbClient()) {
            var scan = client.scan(ScanRequest.builder().tableName(tableName).build());
            for (var item : scan.items()) {
                client.deleteItem(DeleteItemRequest.builder()
                    .tableName(tableName)
                    .key(java.util.Map.of(
                        "pk", item.get("pk"),
                        "sk", item.get("sk")
                    ))
                    .build());
            }
        }
    }
}
