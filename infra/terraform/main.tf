locals {
  name_prefix = "parallax-pilot-${var.environment}"
  tables = toset([
    "score_submissions",
    "best_scores",
    "leaderboard_entries",
    "projection_index",
    "projection_processed",
    "risk_signals",
    "season_metadata",
    "abuse_counters",
    "idempotency",
    "admin_state",
  ])
}

resource "aws_dynamodb_table" "leaderboard" {
  for_each     = local.tables
  name         = "${var.table_prefix}${each.key}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = contains(["idempotency", "projection_processed", "abuse_counters"], each.key)
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Application = "parallax-pilot"
    Environment = var.environment
  }
}

resource "aws_sqs_queue" "projection" {
  name                       = var.projection_queue_name
  message_retention_seconds  = 1209600
  visibility_timeout_seconds = 30

  tags = {
    Application = "parallax-pilot"
    Environment = var.environment
  }
}

resource "aws_s3_bucket" "snapshots" {
  bucket = var.snapshot_bucket_name

  tags = {
    Application = "parallax-pilot"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_versioning" "snapshots" {
  bucket = aws_s3_bucket.snapshots.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "snapshots" {
  bucket = aws_s3_bucket.snapshots.id

  rule {
    id     = "archive-old-snapshots"
    status = "Enabled"

    filter {
      prefix = "leaderboard-snapshots/"
    }

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/parallax-pilot/${var.environment}/api"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "projection_worker" {
  name              = "/aws/parallax-pilot/${var.environment}/projection-worker"
  retention_in_days = 30
}

resource "aws_ecr_repository" "api" {
  name                 = "${local.name_prefix}-api"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "projection_worker" {
  name                 = "${local.name_prefix}-projection-worker"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}
