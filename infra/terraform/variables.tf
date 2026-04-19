variable "aws_region" {
  type    = string
  default = "eu-west-2"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "table_prefix" {
  type    = string
  default = "pp_"
}

variable "projection_queue_name" {
  type    = string
  default = "pp_score-submissions"
}

variable "snapshot_bucket_name" {
  type    = string
  default = "pp-leaderboard-snapshots"
}

variable "vpc_id" {
  type    = string
  default = ""
}

variable "public_subnet_ids" {
  type    = list(string)
  default = []
}

variable "private_subnet_ids" {
  type    = list(string)
  default = []
}

variable "api_image" {
  type    = string
  default = ""
}

variable "projection_worker_image" {
  type    = string
  default = ""
}

variable "api_container_port" {
  type    = number
  default = 8080
}

variable "api_cpu" {
  type    = number
  default = 512
}

variable "api_memory" {
  type    = number
  default = 1024
}

variable "projection_worker_cpu" {
  type    = number
  default = 512
}

variable "projection_worker_memory" {
  type    = number
  default = 1024
}

variable "api_desired_count" {
  type    = number
  default = 1
}

variable "projection_worker_desired_count" {
  type    = number
  default = 1
}

variable "health_check_path" {
  type    = string
  default = "/actuator/health"
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "api_environment_variables" {
  type    = map(string)
  default = {}
}

variable "projection_worker_environment_variables" {
  type    = map(string)
  default = {}
}

variable "api_secret_environment" {
  type    = map(string)
  default = {}
}

variable "projection_worker_secret_environment" {
  type    = map(string)
  default = {}
}

variable "enable_execute_command" {
  type    = bool
  default = true
}

variable "api_min_capacity" {
  type    = number
  default = 1
}

variable "api_max_capacity" {
  type    = number
  default = 2
}

variable "api_cpu_target" {
  type    = number
  default = 60
}

variable "projection_worker_min_capacity" {
  type    = number
  default = 1
}

variable "projection_worker_max_capacity" {
  type    = number
  default = 2
}

variable "projection_worker_cpu_target" {
  type    = number
  default = 60
}

variable "api_managed_ssm_parameters" {
  type      = map(string)
  default   = {}
  sensitive = true
}

variable "projection_worker_managed_ssm_parameters" {
  type      = map(string)
  default   = {}
  sensitive = true
}

variable "api_managed_secrets_manager" {
  type      = map(string)
  default   = {}
  sensitive = true
}

variable "projection_worker_managed_secrets_manager" {
  type      = map(string)
  default   = {}
  sensitive = true
}
