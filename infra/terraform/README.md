# Backend Terraform

Provisioning baseline for the leaderboard backend:

- DynamoDB tables used by API and projection worker
- SQS projection queue
- versioned S3 snapshot bucket
- CloudWatch log groups
- ECR repositories for API and projection worker images
- optional ECS Fargate runtime for API and projection worker
- optional public ALB for the API service
- optional ECS autoscaling policies
- optional runtime environment variables and secret references for ECS tasks
- optional managed SSM Parameter Store and Secrets Manager resources for ECS task secrets

Remote state for this stack is expected to use the `s3` backend with DynamoDB locking. Bootstrap that backend first with `infra/terraform/bootstrap-state/`.

```sh
terraform init
terraform plan -var environment=dev
```

To provision the runtime shape as well, provide at least:

```sh
terraform plan \
	-var environment=dev \
	-var vpc_id=vpc-123456 \
	-var 'public_subnet_ids=["subnet-public-a","subnet-public-b"]' \
	-var 'private_subnet_ids=["subnet-private-a","subnet-private-b"]' \
	-var api_image=123456789012.dkr.ecr.eu-west-2.amazonaws.com/parallax-pilot-dev-api:main \
	-var projection_worker_image=123456789012.dkr.ecr.eu-west-2.amazonaws.com/parallax-pilot-dev-projection-worker:main
```

The container image expected by Terraform is built from [backend/Dockerfile](backend/Dockerfile).

Runtime configuration can be extended with plain environment values and secret references:

```sh
terraform plan \
	-var environment=dev \
	-var api_image=123456789012.dkr.ecr.eu-west-2.amazonaws.com/parallax-pilot-dev-api:sha-abcdef0 \
	-var 'api_environment_variables={SPRING_PROFILES_ACTIVE="default"}' \
	-var 'api_secret_environment={APP_LEADERBOARD_DYNAMODB_ENDPOINT="arn:aws:ssm:eu-west-2:123456789012:parameter/parallax-pilot/dev/api/dynamodb-endpoint",PARALLAX_ADMIN_TOKEN="arn:aws:ssm:eu-west-2:123456789012:parameter/parallax-pilot/dev/api/admin-token"}'
```

Admin endpoints stay disabled for callers without `X-Admin-Token`, so runtime environments should explicitly wire `PARALLAX_ADMIN_TOKEN` through `api_secret_environment` or a managed secret resource. Do not commit real token values into `*.tfvars`.

Example per-environment files live under `infra/terraform/environments/` and are intended as templates, not committed secret values.

Managed secret resources can also be created directly by Terraform:

```sh
terraform plan \
	-var environment=dev \
	-var api_image=123456789012.dkr.ecr.eu-west-2.amazonaws.com/parallax-pilot-dev-api:sha-abcdef0 \
	-var 'api_managed_ssm_parameters={APP_LEADERBOARD_DYNAMODB_ENDPOINT="https://dynamodb.local"}' \
	-var 'projection_worker_managed_secrets_manager={APP_LEADERBOARD_SQS_ENDPOINT="https://sqs.local"}'
```
