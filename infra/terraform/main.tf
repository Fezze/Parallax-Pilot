locals {
  name_prefix = "parallax-pilot-${var.environment}"
  common_tags = merge({
    Application = "parallax-pilot"
    Environment = var.environment
  }, var.tags)
  runtime_enabled = (
    var.vpc_id != "" &&
    length(var.public_subnet_ids) > 0 &&
    length(var.private_subnet_ids) > 0 &&
    var.api_image != ""
  )
  effective_projection_worker_image = var.projection_worker_image != "" ? var.projection_worker_image : var.api_image
  api_environment = merge({
    SERVER_PORT                          = tostring(var.api_container_port)
    AWS_REGION                           = var.aws_region
    APP_LEADERBOARD_TABLE_PREFIX         = var.table_prefix
    APP_LEADERBOARD_PROJECTION_QUEUE_NAME = var.projection_queue_name
    APP_LEADERBOARD_SNAPSHOT_BUCKET_NAME = var.snapshot_bucket_name
  }, var.api_environment_variables)
  projection_worker_environment = merge({
    AWS_REGION                           = var.aws_region
    APP_LEADERBOARD_TABLE_PREFIX         = var.table_prefix
    APP_LEADERBOARD_PROJECTION_QUEUE_NAME = var.projection_queue_name
    APP_LEADERBOARD_SNAPSHOT_BUCKET_NAME = var.snapshot_bucket_name
  }, var.projection_worker_environment_variables)
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
    Application = local.common_tags.Application
    Environment = local.common_tags.Environment
  }
}

resource "aws_sqs_queue" "projection" {
  name                       = var.projection_queue_name
  message_retention_seconds  = 1209600
  visibility_timeout_seconds = 30

  tags = {
    Application = local.common_tags.Application
    Environment = local.common_tags.Environment
  }
}

resource "aws_s3_bucket" "snapshots" {
  bucket = var.snapshot_bucket_name

  tags = {
    Application = local.common_tags.Application
    Environment = local.common_tags.Environment
  }
}

resource "aws_s3_bucket_versioning" "snapshots" {
  bucket = aws_s3_bucket.snapshots.id

  versioning_configuration {
    status = "Enabled"
  }
}

data "aws_iam_policy_document" "ecs_task_assume_role" {
  count = local.runtime_enabled ? 1 : 0

  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "backend_runtime_access" {
  count = local.runtime_enabled ? 1 : 0

  statement {
    actions = [
      "dynamodb:BatchGetItem",
      "dynamodb:DeleteItem",
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:UpdateItem",
    ]
    resources = [for table in aws_dynamodb_table.leaderboard : table.arn]
  }

  statement {
    actions = [
      "sqs:ChangeMessageVisibility",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:GetQueueUrl",
      "sqs:ListQueues",
      "sqs:PurgeQueue",
      "sqs:ReceiveMessage",
      "sqs:SendMessage",
    ]
    resources = [aws_sqs_queue.projection.arn]
  }

  statement {
    actions = [
      "s3:GetBucketLocation",
      "s3:ListBucket",
    ]
    resources = [aws_s3_bucket.snapshots.arn]
  }

  statement {
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = ["${aws_s3_bucket.snapshots.arn}/*"]
  }
}

resource "aws_ecs_cluster" "backend" {
  count = local.runtime_enabled ? 1 : 0
  name  = "${local.name_prefix}-cluster"

  tags = local.common_tags
}

resource "aws_security_group" "alb" {
  count       = local.runtime_enabled ? 1 : 0
  name        = "${local.name_prefix}-alb"
  description = "Public ingress for Parallax Pilot backend API"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_security_group" "service" {
  count       = local.runtime_enabled ? 1 : 0
  name        = "${local.name_prefix}-service"
  description = "Service access for Parallax Pilot ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = var.api_container_port
    to_port         = var.api_container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb[0].id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_lb" "api" {
  count              = local.runtime_enabled ? 1 : 0
  name               = substr(replace("${local.name_prefix}-api", "/[^a-zA-Z0-9-]/", "-"), 0, 32)
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb[0].id]
  subnets            = var.public_subnet_ids

  tags = local.common_tags
}

resource "aws_lb_target_group" "api" {
  count       = local.runtime_enabled ? 1 : 0
  name        = substr(replace("${local.name_prefix}-api", "/[^a-zA-Z0-9-]/", "-"), 0, 32)
  port        = var.api_container_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  health_check {
    enabled             = true
    path                = var.health_check_path
    matcher             = "200-399"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
  }

  tags = local.common_tags
}

resource "aws_lb_listener" "api" {
  count             = local.runtime_enabled ? 1 : 0
  load_balancer_arn = aws_lb.api[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api[0].arn
  }
}

resource "aws_iam_role" "ecs_execution" {
  count              = local.runtime_enabled ? 1 : 0
  name               = "${local.name_prefix}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  count      = local.runtime_enabled ? 1 : 0
  role       = aws_iam_role.ecs_execution[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "api_task" {
  count              = local.runtime_enabled ? 1 : 0
  name               = "${local.name_prefix}-api-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role[0].json

  tags = local.common_tags
}

resource "aws_iam_role" "projection_worker_task" {
  count              = local.runtime_enabled ? 1 : 0
  name               = "${local.name_prefix}-projection-worker-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy" "api_task" {
  count  = local.runtime_enabled ? 1 : 0
  name   = "${local.name_prefix}-api-runtime"
  role   = aws_iam_role.api_task[0].id
  policy = data.aws_iam_policy_document.backend_runtime_access[0].json
}

resource "aws_iam_role_policy" "projection_worker_task" {
  count  = local.runtime_enabled ? 1 : 0
  name   = "${local.name_prefix}-projection-worker-runtime"
  role   = aws_iam_role.projection_worker_task[0].id
  policy = data.aws_iam_policy_document.backend_runtime_access[0].json
}

resource "aws_ecs_task_definition" "api" {
  count                    = local.runtime_enabled ? 1 : 0
  family                   = "${local.name_prefix}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.api_cpu)
  memory                   = tostring(var.api_memory)
  execution_role_arn       = aws_iam_role.ecs_execution[0].arn
  task_role_arn            = aws_iam_role.api_task[0].arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = var.api_image
      essential = true
      portMappings = [
        {
          containerPort = var.api_container_port
          protocol      = "tcp"
        }
      ]
      environment = [
        for name in sort(keys(local.api_environment)) : {
          name  = name
          value = local.api_environment[name]
        }
      ]
      secrets = [
        for name in sort(keys(var.api_secret_environment)) : {
          name      = name
          valueFrom = var.api_secret_environment[name]
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  tags = local.common_tags
}

resource "aws_ecs_task_definition" "projection_worker" {
  count                    = local.runtime_enabled ? 1 : 0
  family                   = "${local.name_prefix}-projection-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.projection_worker_cpu)
  memory                   = tostring(var.projection_worker_memory)
  execution_role_arn       = aws_iam_role.ecs_execution[0].arn
  task_role_arn            = aws_iam_role.projection_worker_task[0].arn

  container_definitions = jsonencode([
    {
      name      = "projection-worker"
      image     = local.effective_projection_worker_image
      essential = true
      command   = ["--spring.profiles.active=worker"]
      environment = [
        for name in sort(keys(local.projection_worker_environment)) : {
          name  = name
          value = local.projection_worker_environment[name]
        }
      ]
      secrets = [
        for name in sort(keys(var.projection_worker_secret_environment)) : {
          name      = name
          valueFrom = var.projection_worker_secret_environment[name]
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.projection_worker.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  tags = local.common_tags
}

resource "aws_ecs_service" "api" {
  count           = local.runtime_enabled ? 1 : 0
  name            = "${local.name_prefix}-api"
  cluster         = aws_ecs_cluster.backend[0].id
  task_definition = aws_ecs_task_definition.api[0].arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"
  enable_execute_command = var.enable_execute_command

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.service[0].id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api[0].arn
    container_name   = "api"
    container_port   = var.api_container_port
  }

  depends_on = [aws_lb_listener.api]

  tags = local.common_tags
}

resource "aws_ecs_service" "projection_worker" {
  count           = local.runtime_enabled ? 1 : 0
  name            = "${local.name_prefix}-projection-worker"
  cluster         = aws_ecs_cluster.backend[0].id
  task_definition = aws_ecs_task_definition.projection_worker[0].arn
  desired_count   = var.projection_worker_desired_count
  launch_type     = "FARGATE"
  enable_execute_command = var.enable_execute_command

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.service[0].id]
    assign_public_ip = false
  }

  tags = local.common_tags
}

resource "aws_appautoscaling_target" "api" {
  count              = local.runtime_enabled ? 1 : 0
  max_capacity       = var.api_max_capacity
  min_capacity       = var.api_min_capacity
  resource_id        = "service/${aws_ecs_cluster.backend[0].name}/${aws_ecs_service.api[0].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_cpu" {
  count              = local.runtime_enabled ? 1 : 0
  name               = "${local.name_prefix}-api-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api[0].resource_id
  scalable_dimension = aws_appautoscaling_target.api[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.api[0].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    target_value = var.api_cpu_target
  }
}

resource "aws_appautoscaling_target" "projection_worker" {
  count              = local.runtime_enabled ? 1 : 0
  max_capacity       = var.projection_worker_max_capacity
  min_capacity       = var.projection_worker_min_capacity
  resource_id        = "service/${aws_ecs_cluster.backend[0].name}/${aws_ecs_service.projection_worker[0].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "projection_worker_cpu" {
  count              = local.runtime_enabled ? 1 : 0
  name               = "${local.name_prefix}-projection-worker-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.projection_worker[0].resource_id
  scalable_dimension = aws_appautoscaling_target.projection_worker[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.projection_worker[0].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    target_value = var.projection_worker_cpu_target
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
