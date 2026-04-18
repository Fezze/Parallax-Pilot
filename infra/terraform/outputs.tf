output "projection_queue_url" {
  value = aws_sqs_queue.projection.url
}

output "snapshot_bucket_name" {
  value = aws_s3_bucket.snapshots.bucket
}

output "dynamodb_table_names" {
  value = [for table in aws_dynamodb_table.leaderboard : table.name]
}

output "api_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "projection_worker_repository_url" {
  value = aws_ecr_repository.projection_worker.repository_url
}
