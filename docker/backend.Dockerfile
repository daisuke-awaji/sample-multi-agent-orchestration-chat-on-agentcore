# AgentCore Backend API Dockerfile for AWS Lambda
# Lambda Web Adapter を使用してExpressアプリをLambdaで実行
# Multi-stage build with monorepo workspace support

# ========================================
# Stage 1: Build
# ========================================
FROM public.ecr.aws/docker/library/node:22-slim AS builder

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

# Copy entire monorepo (.dockerignore controls what's excluded)
COPY . .

# Install all dependencies and build
# 1. tsc --build: builds shared libs with dependency resolution (generative-ui-catalog → tool-definitions)
# 2. npm run build: builds backend package
RUN npm ci
RUN npx tsc --build tsconfig.build.json --force
RUN npm run build --workspace=@moca/backend

# ========================================
# Stage 2: Production Runtime
# ========================================
FROM public.ecr.aws/docker/library/node:22-slim

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

# Copy workspace root package files for npm workspace resolution
COPY --chown=node:node package*.json ./
COPY --chown=node:node packages/backend/package.json ./packages/backend/
COPY --chown=node:node packages/libs/tool-definitions/package.json ./packages/libs/tool-definitions/
COPY --chown=node:node packages/libs/generative-ui-catalog/package.json ./packages/libs/generative-ui-catalog/

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built artifacts from builder stage
COPY --chown=node:node --from=builder /build/packages/backend/dist ./packages/backend/dist
COPY --chown=node:node --from=builder /build/packages/libs/tool-definitions/dist ./packages/libs/tool-definitions/dist
COPY --chown=node:node --from=builder /build/packages/libs/generative-ui-catalog/dist ./packages/libs/generative-ui-catalog/dist

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

# Health check for container image security compliance
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/ping || exit 1

# Run as non-root user for security
USER node

# アプリケーションを開始
CMD ["node", "dist/index.js"]