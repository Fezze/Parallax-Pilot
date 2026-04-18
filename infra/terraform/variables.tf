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
