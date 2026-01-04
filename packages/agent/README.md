# AgentCore Runtime Agent

TypeScript 版 Strands Agent を Amazon Bedrock AgentCore Runtime で動作させるためのパッケージです。

## 特徴

- 🤖 **Strands AI Agent**: AI エージェント
- 🚀 **AgentCore Runtime 対応**: `/ping` と `/invocations` エンドポイント実装
- 🐳 **Docker 対応**: コンテナ化された実行環境
- 🔐 **AWS 認証**: ローカル開発時の認証情報マウント対応

## クイックスタート

### 前提条件

- Node.js 18 以上
- Docker & Docker Compose
- AWS CLI 設定済み（`aws configure` または SSO）

### 1. ローカル開発（Node.js）

```bash
# 依存関係をインストール
npm install

# TypeScriptをコンパイル
npm run build

# 開発サーバー起動
npm run dev
```

### 2. Docker 開発環境（推奨）

```bash
# AWS認証情報付きでDocker Compose起動
npm run docker:dev

# バックグラウンドで起動
npm run docker:dev:detach

# ログを確認
npm run docker:logs

# ヘルスチェック
npm run docker:test

# 停止
npm run docker:stop
```

## API エンドポイント

### ヘルスチェック

```bash
curl http://localhost:8080/ping
```

**レスポンス例:**

```json
{
  "status": "Healthy",
  "time_of_last_update": 1766024243
}
```

### Agent 呼び出し

```bash
echo -n "東京の天気を教えて" | curl -X POST http://localhost:8080/invocations \
  -H "Content-Type: application/octet-stream" \
  --data-binary @-
```

**レスポンス例:**

```json
{
  "response": {
    "type": "agentResult",
    "stopReason": "endTurn",
    "lastMessage": {
      "type": "message",
      "role": "assistant",
      "content": [
        {
          "type": "textBlock",
          "text": "東京の天気情報:\n気温: 22°C\n天候: 晴れ\n湿度: 65%\n風速: 5 km/h"
        }
      ]
    }
  }
}
```

## 利用可能なツール

### ローカルツール

`./src/tools` 配下のツールが利用できます。

### MCP サーバー統合

このエージェントは **Model Context Protocol (MCP)** をサポートしており、以下の3つの方法でツールを拡張できます：

1. **AgentCore Gateway 経由** - リモート MCP サーバー（自動）
2. **ローカル stdio MCP サーバー** - コマンドラインツール
3. **リモート HTTP/SSE MCP サーバー** - Web API

#### mcp.json 設定ファイル

ローカル MCP サーバーを使用するには、プロジェクトルートに `mcp.json` ファイルを作成します：

```bash
# サンプルファイルをコピー
cp mcp.json.example mcp.json

# 必要に応じて編集
vi mcp.json
```

#### 設定例

```json
{
  "mcpServers": {
    "aws-docs": {
      "transport": "stdio",
      "command": "uvx",
      "args": ["awslabs.aws-documentation-mcp-server@latest"],
      "enabled": true
    },
    "github": {
      "transport": "stdio",
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", 
               "ghcr.io/github/github-mcp-server"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      },
      "enabled": false
    },
    "github-copilot": {
      "transport": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GITHUB_PAT}"
      },
      "enabled": false
    }
  }
}
```

#### トランスポート種別

| トランスポート | 説明 | 用途 |
|--------------|------|------|
| `stdio` | ローカルプロセスとの通信 | CLI ツール、Docker コンテナ |
| `http` | Streamable HTTP 経由 | リモート Web API |
| `sse` | Server-Sent Events 経由 | リアルタイム通信 |

#### 環境変数の展開

`${VAR_NAME}` 形式で環境変数を参照できます：

```json
{
  "env": {
    "API_KEY": "${MY_API_KEY}",
    "REGION": "${AWS_REGION}"
  }
}
```

#### MCP サーバーの有効化/無効化

各サーバーは `enabled` フィールドで制御できます（デフォルト: `true`）：

```json
{
  "aws-docs": {
    "transport": "stdio",
    "command": "uvx",
    "args": ["awslabs.aws-documentation-mcp-server@latest"],
    "enabled": true  // このサーバーを有効化
  },
  "filesystem": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    "enabled": false  // このサーバーを無効化
  }
}
```

#### 設定ファイルのパス指定

デフォルトでは `./mcp.json` を読み込みますが、環境変数で変更可能です：

```bash
export MCP_CONFIG_PATH=/path/to/custom-mcp.json
npm run dev
```

#### 人気のある MCP サーバー

- **AWS Documentation**: `awslabs.aws-documentation-mcp-server@latest`
- **GitHub**: `ghcr.io/github/github-mcp-server`
- **Filesystem**: `@modelcontextprotocol/server-filesystem`
- **Tavily Search**: `tavily-mcp@0.1.2`

詳細は [MCP サーバーリスト](https://github.com/modelcontextprotocol/servers) を参照してください。

## AWS 認証設定

### ⚠️ 重要な制限事項

**Docker 環境での`credential_process`制限**：

- 一部の認証ツールを使用した`credential_process`は、Docker コンテナ内では動作しない場合があります
- この制限は技術的な仕様であり、本実装の問題ではありません
- **AgentCore Runtime 本番環境では、IAM ロールが自動設定されるため、この問題は発生しません**

### 方法 1: .env.local ファイル（推奨）

ローカル環境変数ファイルを使用して認証情報を設定：

```bash
# .env.local ファイルを作成
cat > .env.local << EOF
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_SESSION_TOKEN=your_session_token
AWS_REGION=us-west-2
EOF

# Docker起動
npm run docker:dev:aws
```

### 方法 2: ローカルスクリプト（isengardcli 用）

Amazon 社内ユーザー向けの isengardcli 便利スクリプト：

```bash
# テンプレートをコピー
cp scripts/get-aws-credentials.local.sh.example scripts/get-aws-credentials.local.sh

# 必要に応じてメールアドレス・ロールを編集
vi scripts/get-aws-credentials.local.sh

# Docker起動
npm run docker:dev:aws
```

**特徴:**

- isengardcli から自動で認証情報を取得
- `.env.local`ファイルに保存
- 有効期限の表示
- エラーハンドリング付き

### 方法 3: 環境変数による直接設定

```bash
# 認証情報を直接設定
export AWS_ACCESS_KEY_ID="your_access_key"
export AWS_SECRET_ACCESS_KEY="your_secret_key"
export AWS_SESSION_TOKEN="your_session_token"  # 必要な場合
export AWS_REGION="us-west-2"

# Docker起動
npm run docker:dev
```

### 方法 4: AWS SSO（標準的な認証の場合）

```bash
# AWS SSOログイン
aws sso login

# 一時認証情報を.env.localに出力
aws sts get-session-token --duration-seconds 3600 --output json | \
  jq -r '"AWS_ACCESS_KEY_ID=" + .Credentials.AccessKeyId,
         "AWS_SECRET_ACCESS_KEY=" + .Credentials.SecretAccessKey,
         "AWS_SESSION_TOKEN=" + .Credentials.SessionToken,
         "AWS_REGION=us-west-2"' > .env.local

# Docker Compose起動
npm run docker:dev:aws
```

### 本番環境での注意

**AgentCore Runtime**では：

- ✅ IAM ロールが自動的に設定されます
- ✅ Bedrock、CloudWatch Logs へのアクセス権限が自動付与されます
- ✅ 認証情報の手動設定は不要です
- ✅ この認証問題は発生しません

**ローカル開発**では：

- ⚠️ `credential_process`の制限があります
- 💡 上記の代替方法をご利用ください

## ワークスペース同期

AgentCore Runtime は起動時に S3 からユーザーのファイルをダウンロードし、終了時にアップロードします。

### .syncignore による除外設定

`.gitignore` スタイルのパターンマッチングで、同期対象外のファイルを指定できます。

#### 使い方

ワークスペースのルートディレクトリに `.syncignore` ファイルを作成：

```bash
# .syncignore
# コメント行

# カスタムパターン
secrets/
*.key
*.pem
test-data/
*.zip
```

#### デフォルト除外パターン

`.syncignore` ファイルがなくても、以下は自動的に除外されます：

```
# システムファイル
.DS_Store
Thumbs.db
*.swp
*.swo
*~

# ビルド成果物
node_modules/
__pycache__/
*.pyc
.gradle/
build/
dist/
target/

# IDE設定
.idea/
.vscode/
*.iml

# ログファイル
*.log
logs/

# 一時ファイル
*.tmp
*.temp
.cache/

# .syncignore自体
.syncignore
```

#### パターン記法

| パターン | 説明 | 例 |
|---------|------|-----|
| `*.ext` | 拡張子マッチ | `*.log` → すべての.logファイル |
| `dir/` | ディレクトリ除外 | `secrets/` → secretsディレクトリ全体 |
| `*pattern*` | 部分マッチ | `*-old.*` → -old.を含むファイル |
| `!pattern` | 否定（例外指定） | `!important.log` → このファイルは除外しない |

#### 動作仕様

- **ダウンロード時**: S3からダウンロードする際に除外パターンを適用
- **アップロード時**: ローカルからS3へアップロードする際に除外パターンを適用
- **カスタムパターン読込**: S3から`.syncignore`をダウンロード後、カスタムパターンを読み込む

#### 使用例

```bash
# プロジェクトルートに.syncignoreを作成
cat > .syncignore << EOF
# 機密情報
credentials/
*.env
*.pem

# 大容量ファイル
*.mp4
*.zip
data/large-dataset/

# テストデータ
test-fixtures/
mock-data/
EOF
```

## 環境変数

| 変数名       | デフォルト値 | 説明                  |
| ------------ | ------------ | --------------------- |
| `PORT`       | 8080         | HTTP サーバーのポート |
| `AWS_REGION` | us-east-1    | AWS リージョン        |
| `NODE_ENV`   | development  | Node.js 環境          |
| `LOG_LEVEL`  | info         | ログレベル            |

## デプロイ

### AgentCore Runtime へのデプロイ

```bash
# CDKスタックをデプロイ
cd ../cdk
npx cdk deploy

# 出力されるRuntime IDを確認
# AgentCoreStack.AgentRuntimeId = StrandsAgentsTS-XXXXXXXXXX
```

### Agent Sandbox でのテスト

1. AWS コンソール → Amazon Bedrock → Agent Sandbox
2. Runtime ID: `StrandsAgentsTS-XXXXXXXXXX` を選択
3. "東京の天気を教えて" などでテスト

## トラブルシューティング

### AWS 認証エラー

```
Could not load credentials from any providers
```

**解決方法:**

- AWS CLI が設定されているか確認: `aws configure list`
- SSO の場合: `aws sso login`
- Docker volume マウントが正しいか確認

### Docker 起動エラー

```bash
# コンテナを完全に削除して再起動
docker-compose down --volumes
npm run docker:dev
```

### ポート競合エラー

```bash
# ポート8080が使用中の場合
docker-compose down
lsof -ti:8080 | xargs kill -9
npm run docker:dev
```

## 開発

### ファイル構成

```
packages/agent/
├── src/
│   ├── index.ts          # HTTPサーバー
│   ├── agent.ts          # Strands Agent定義
│   └── tools/
│       └── weather.ts    # 天気ツール
├── Dockerfile            # Dockerイメージ設定
├── docker-compose.yml    # 開発環境設定
└── package.json          # npm scripts
```

### カスタムツールの追加

1. `src/tools/` にツールファイルを作成
2. `src/agent.ts` でツールを追加
3. `npm run build` でビルド
4. `npm run docker:dev` で動作確認

例:

```typescript
import { tool } from "@strands-agents/sdk";
import { z } from "zod";

export const myCustomTool = tool({
  name: "my_custom_tool",
  description: "カスタムツールの説明",
  inputSchema: z.object({
    input: z.string().describe("入力パラメータ"),
  }),
  callback: (input) => {
    return `カスタムツールの結果: ${input.input}`;
  },
});
```

## ライセンス

MIT
