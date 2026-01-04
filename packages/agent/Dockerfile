# AgentCore Runtime Agent Dockerfile
# Multi-stage build for optimized image size

# ========================================
# Stage 1: Build
# ========================================
FROM node:20-slim AS builder

WORKDIR /app

# パッケージファイルをコピー
COPY package*.json ./

# 依存関係をインストール（ビルド時のみ dev dependencies も含む）
RUN npm install

# TypeScript 設定とソースコードをコピー
COPY tsconfig.json ./
COPY src/ ./src/

# TypeScript をコンパイル
RUN npm run build

# ========================================
# Stage 2: Production
# ========================================
FROM node:20-slim

# 必要なツールをインストール（ヘルスチェック、Python、AWS CLI、GitHub CLI用）
RUN apt-get update && apt-get install -y \
    curl \
    python3 \
    python3-pip \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# AWS CLI をインストール (pip - アーキテクチャ非依存)
RUN pip3 install awscli --break-system-packages

# GitHub CLI をインストール
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
    dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | \
    tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && \
    apt-get install -y gh && \
    rm -rf /var/lib/apt/lists/*

# uv/uvx をインストール（Python 製 MCP サーバー用）
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/uv && \
    mv /root/.local/bin/uvx /usr/local/bin/uvx && \
    chmod +x /usr/local/bin/uv /usr/local/bin/uvx

# 作業ディレクトリを設定
WORKDIR /app

# パッケージファイルをコピー
COPY package*.json ./

# 本番用依存関係のみインストール
RUN npm install --only=production && npm cache clean --force

# ビルド済みファイルをコピー
COPY --from=builder /app/dist ./dist

# Entrypoint スクリプトをコピー
COPY scripts/startup.sh /app/startup.sh
RUN chmod +x /app/startup.sh

# ポート 8080 を公開
EXPOSE 8080

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/ping || exit 1

# アプリケーションを開始（Entrypoint スクリプト経由）
CMD ["/app/startup.sh"]
