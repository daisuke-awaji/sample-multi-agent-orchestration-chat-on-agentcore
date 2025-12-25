# AgentCore Runtime Agent Dockerfile
FROM node:20-slim

# curl をインストール（ヘルスチェック用）
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# uv/uvx をインストール（Python 製 MCP サーバー用）
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/uv && \
    mv /root/.local/bin/uvx /usr/local/bin/uvx && \
    chmod +x /usr/local/bin/uv /usr/local/bin/uvx

# 作業ディレクトリを設定
WORKDIR /app

# パッケージファイルをコピー
COPY package*.json ./
COPY tsconfig.json ./

# 依存関係をインストール（dev dependencies も含む）
RUN npm install

# ソースコードをコピー
COPY src/ ./src/

# TypeScript をコンパイル
RUN npm run build

# 本番用依存関係のみ再インストール
RUN npm install --only=production && npm cache clean --force

# ポート 8080 を公開
EXPOSE 8080

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/ping || exit 1

# アプリケーションを開始
CMD ["npm", "start"]
