# Backend Terraform

Provisioning baseline for the leaderboard backend:

- DynamoDB tables used by API and projection worker
- SQS projection queue
- versioned S3 snapshot bucket
- CloudWatch log groups
- ECR repositories for API and projection worker images
- optional ECS Fargate runtime for API and projection worker
- optional public ALB for the API service

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
