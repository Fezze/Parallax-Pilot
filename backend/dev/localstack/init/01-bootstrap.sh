#!/bin/sh
set -eu

awslocal dynamodb create-table \
  --table-name pp_score_submissions \
  --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST || true

awslocal dynamodb create-table \
  --table-name pp_best_scores \
  --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST || true

awslocal dynamodb create-table \
  --table-name pp_leaderboard_entries \
  --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST || true

awslocal sqs create-queue --queue-name pp_score-submissions || true
awslocal s3 mb s3://pp_leaderboard-snapshots || true
