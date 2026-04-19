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
