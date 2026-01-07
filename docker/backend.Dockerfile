# AgentCore Backend API Dockerfile for AWS Lambda
# Lambda Web Adapter を使用してExpressアプリをLambdaで実行
# Multi-stage build with monorepo workspace support

# ========================================
# Stage 1: Build
# ========================================
FROM node:22-slim AS builder

WORKDIR /build

# 必要なツールをインストール（Python、MCP サーバー実行用）
RUN apt-get update && apt-get install -y \
    curl \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# uv をグローバルにインストール（全ユーザーアクセス可能）
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/uv && \
    mv /root/.local/bin/uvx /usr/local/bin/uvx && \
    chmod +x /usr/local/bin/uv /usr/local/bin/uvx

# Copy workspace root package files
COPY package*.json ./
COPY tsconfig.base.json ./

# Copy all workspace package.json files
COPY packages/backend/package*.json ./packages/backend/
COPY packages/backend/tsconfig.json ./packages/backend/
COPY packages/shared/tool-definitions/package*.json ./packages/shared/tool-definitions/
COPY packages/shared/tool-definitions/tsconfig.json ./packages/shared/tool-definitions/

# Install all dependencies (including workspace dependencies)
RUN npm ci

# Copy source code for all required packages
COPY packages/shared/tool-definitions/src/ ./packages/shared/tool-definitions/src/
COPY packages/backend/src/ ./packages/backend/src/

# Build shared packages first
RUN cd packages/shared/tool-definitions && npm run build

# Build backend package
RUN cd packages/backend && npm run build

# ========================================
# Stage 2: Production Runtime
# ========================================
FROM node:22-slim

# 必要なツールをインストール（Python、MCP サーバー実行用）
RUN apt-get update && apt-get install -y \
    curl \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# uv をグローバルにインストール（全ユーザーアクセス可能）
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/uv && \
    mv /root/.local/bin/uvx /usr/local/bin/uvx && \
    chmod +x /usr/local/bin/uv /usr/local/bin/uvx

# uv ディレクトリ設定（Lambda /tmp 制約対応）
ENV UV_TOOL_DIR="/tmp/uv_tools"
ENV UV_TOOL_BIN_DIR="/tmp/uv_bin"

# Lambda Web Adapter をインストール
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

WORKDIR /app

# Copy workspace root package files
COPY package*.json ./

# Copy workspace package.json files
COPY packages/backend/package*.json ./packages/backend/
COPY packages/shared/tool-definitions/package*.json ./packages/shared/tool-definitions/

# Install production dependencies only (skip scripts like husky)
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built files from builder stage
COPY --from=builder /build/packages/shared/tool-definitions/dist ./packages/shared/tool-definitions/dist
COPY --from=builder /build/packages/shared/tool-definitions/package.json ./packages/shared/tool-definitions/
COPY --from=builder /build/packages/backend/dist ./packages/backend/dist

# Set working directory to backend package
WORKDIR /app/packages/backend

# Lambda Web Adapter 環境変数設定
ENV PORT=8080
ENV AWS_LWA_PORT=8080
ENV AWS_LWA_READINESS_CHECK_PATH=/ping
ENV AWS_LWA_INVOKE_MODE=BUFFERED
ENV AWS_LWA_ASYNC_INIT=true

# Node.js最適化設定
ENV NODE_ENV=production
ENV AWS_NODEJS_CONNECTION_REUSE_ENABLED=1

# 実行権限の設定
RUN chmod +x /opt/extensions/lambda-adapter

# アプリケーションを開始
# Lambda Web Adapter が Express サーバーを Lambda ハンドラーとしてラップ
CMD ["node", "dist/index.js"]
