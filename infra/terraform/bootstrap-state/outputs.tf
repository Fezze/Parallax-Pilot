output "state_bucket_name" {
  value = aws_s3_bucket.state.bucket
}

output "lock_table_name" {
  value = aws_dynamodb_table.lock.name
}

output "backend_config_snippet" {
  value = <<-EOT
bucket         = "${aws_s3_bucket.state.bucket}"
key            = "${var.environment}/terraform.tfstate"
region         = "${var.aws_region}"
dynamodb_table = "${aws_dynamodb_table.lock.name}"
encrypt        = true
  EOT
}