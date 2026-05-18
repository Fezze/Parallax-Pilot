# Terraform State Bootstrap

This stack exists only to provision the S3 bucket and DynamoDB table used by the main backend Terraform state.

```sh
terraform -chdir=infra/terraform/bootstrap-state init
terraform -chdir=infra/terraform/bootstrap-state apply \
	-var environment=dev \
	-var state_bucket_name=pp-dev-terraform-state \
	-var lock_table_name=pp-dev-terraform-locks
```

Then initialize the main stack with matching backend settings:

```sh
terraform -chdir=infra/terraform init \
	-backend-config="bucket=pp-dev-terraform-state" \
	-backend-config="key=dev/terraform.tfstate" \
	-backend-config="region=eu-west-2" \
	-backend-config="dynamodb_table=pp-dev-terraform-locks" \
	-backend-config="encrypt=true"
```