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

# GitLab Token を Secrets Manager から取得して環境変数に設定
if [ -n "$GITLAB_TOKEN_SECRET_NAME" ]; then
  echo "Retrieving GitLab token from Secrets Manager: $GITLAB_TOKEN_SECRET_NAME"
  echo "Using region: ${AWS_REGION:-us-east-1}"
  
  GITLAB_TOKEN=$(aws secretsmanager get-secret-value \
    --secret-id "$GITLAB_TOKEN_SECRET_NAME" \
    --query 'SecretString' \
    --output text \
    --region "${AWS_REGION:-us-east-1}" 2>&1) || {
    echo "Failed to retrieve GitLab secret: $GITLAB_TOKEN"
    GITLAB_TOKEN=""
  }
  
  if [ -n "$GITLAB_TOKEN" ] && [ "$GITLAB_TOKEN" != "null" ] && [[ "$GITLAB_TOKEN" != *"Error"* ]]; then
    export GITLAB_TOKEN
    export GITLAB_HOST="${GITLAB_HOST:-gitlab.com}"
    
    # Configure git for GitLab authentication
    git config --global credential.helper store
    echo "https://oauth2:${GITLAB_TOKEN}@${GITLAB_HOST}" > ~/.git-credentials
    
    # Authenticate glab CLI if available
    if command -v glab &> /dev/null; then
      echo "$GITLAB_TOKEN" | glab auth login --hostname "$GITLAB_HOST" --stdin
      echo "GitLab CLI (glab) authenticated successfully for $GITLAB_HOST"
      glab auth status
    else
      echo "glab CLI not found, using GITLAB_TOKEN environment variable only"
    fi
    
    echo "GitLab authenticated successfully for $GITLAB_HOST"
  else
    echo "Warning: Could not retrieve GitLab token, skipping GitLab auth"
    echo "Token value (first 20 chars): ${GITLAB_TOKEN:0:20}"
  fi
else
  echo "GITLAB_TOKEN_SECRET_NAME not set, skipping GitLab authentication"
fi

# アプリケーション起動
echo "Starting Node.js application..."
exec npm start
