# Backend Terraform

Provisioning baseline for the leaderboard backend:

- DynamoDB tables used by API and projection worker
- SQS projection queue
- versioned S3 snapshot bucket
- CloudWatch log groups
- ECR repositories for API and projection worker images

```sh
terraform init
terraform plan -var environment=dev
```
