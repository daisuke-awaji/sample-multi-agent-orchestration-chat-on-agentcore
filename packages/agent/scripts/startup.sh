#!/bin/bash
set -e

echo "Starting AgentCore Runtime..."
echo "AWS_REGION: ${AWS_REGION:-us-east-1}"

# GitHub Token を Secrets Manager から取得して認証
if [ -n "$GITHUB_TOKEN_SECRET_NAME" ]; then
  echo "Retrieving GitHub token from Secrets Manager: $GITHUB_TOKEN_SECRET_NAME"
  echo "Using region: ${AWS_REGION:-us-east-1}"
  
  # AWS CLIの確認
  aws --version
  
  GITHUB_TOKEN=$(aws secretsmanager get-secret-value \
    --secret-id "$GITHUB_TOKEN_SECRET_NAME" \
    --query 'SecretString' \
    --output text \
    --region "${AWS_REGION:-us-east-1}" 2>&1) || {
    echo "Failed to retrieve secret: $GITHUB_TOKEN"
    GITHUB_TOKEN=""
  }
  
  if [ -n "$GITHUB_TOKEN" ] && [ "$GITHUB_TOKEN" != "null" ] && [[ "$GITHUB_TOKEN" != *"Error"* ]]; then
    echo "$GITHUB_TOKEN" | gh auth login --with-token
    echo "GitHub CLI authenticated successfully"
    gh auth status
  else
    echo "Warning: Could not retrieve GitHub token, skipping gh auth"
    echo "Token value (first 20 chars): ${GITHUB_TOKEN:0:20}"
  fi
else
  echo "GITHUB_TOKEN_SECRET_NAME not set, skipping GitHub CLI authentication"
fi

# アプリケーション起動
echo "Starting Node.js application..."
exec npm start
