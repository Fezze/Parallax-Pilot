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

output "ecs_cluster_name" {
  value = local.runtime_enabled ? aws_ecs_cluster.backend[0].name : null
}

output "api_service_name" {
  value = local.runtime_enabled ? aws_ecs_service.api[0].name : null
}

output "projection_worker_service_name" {
  value = local.runtime_enabled ? aws_ecs_service.projection_worker[0].name : null
}

output "api_url" {
  value = local.runtime_enabled ? "http://${aws_lb.api[0].dns_name}" : null
}
