# ローカル開発環境セットアップガイド

## 概要

このプロジェクトでは、CloudFormation スタックの出力から環境変数を自動取得し、`.env` ファイルを生成する仕組みを実装しています。これにより、開発者は手動で環境変数を設定する手間を省き、デプロイ後すぐにローカル開発を開始できます。

## 🎯 開発パターン

### パターンA: ローカル開発モード（デフォルト）

```
┌──────────────────────────────────────────────────────────────┐
│ ローカル                                                      │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐                │
│  │Frontend │ ──▶ │Backend  │ ──▶ │Agent    │                │
│  │:5173    │     │:3000    │     │:8080    │                │
│  └─────────┘     └─────────┘     └─────────┘                │
│                       │               │                      │
└───────────────────────┼───────────────┼──────────────────────┘
                        │               │
                        ▼               ▼
              ┌─────────────────────────────────┐
              │ クラウド (AWS)                   │
              │  - Cognito (認証)               │
              │  - AgentCore Gateway/Memory    │
              │  - S3 (User Storage)           │
              └─────────────────────────────────┘
```

**特徴:**
- Frontend は `localhost:3000` (Backend) と `localhost:8080` (Agent) に接続
- Backend/Agent は AWS リソース（Cognito, Memory, Gateway, S3）に接続
- ホットリロードが効き、開発サイクルが速い
- デバッグしやすく、Lambda 呼び出しコストがかからない

## 🚀 クイックスタート

### 1. CDK スタックをデプロイ

```bash
npm run deploy
```

### 2. 環境変数を自動セットアップ

```bash
npm run setup-env
```

このコマンドは以下を実行します：
- CloudFormation スタック出力を取得
- 各パッケージの `.env` ファイルを自動生成
  - `packages/frontend/.env`
  - `packages/backend/.env`
  - `packages/agent/.env`

### 3. 全サービスを起動

```bash
npm run dev
```

または個別に起動：

```bash
npm run dev:frontend   # Frontend のみ
npm run dev:backend    # Backend のみ
npm run dev:agent      # Agent のみ
```

## 📝 setup-env の詳細

### 実行方法

```bash
# デフォルト（AgentCoreStack）
npm run setup-env

# カスタムスタック名を指定
STACK_NAME=MyCustomStack npm run setup-env
```

### 生成される環境変数

#### Frontend (packages/frontend/.env)

```bash
# Cognito Configuration
VITE_COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxx
VITE_AWS_REGION=us-east-1

# Backend API Configuration (ローカル開発モード)
VITE_BACKEND_URL=http://localhost:3000

# Agent API Configuration (ローカル開発モード)
VITE_AGENT_ENDPOINT=http://localhost:8080/invocations
```

#### Backend (packages/backend/.env)

```bash
# サーバー設定
PORT=3000
NODE_ENV=development

# CORS設定
CORS_ALLOWED_ORIGINS=*

# JWT / JWKS 設定
COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
COGNITO_REGION=us-east-1

# AgentCore Memory 設定
AGENTCORE_MEMORY_ID=memory-id
AGENTCORE_GATEWAY_ENDPOINT=https://xxx.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp

# User Storage 設定
USER_STORAGE_BUCKET_NAME=bucket-name
```

#### Agent (packages/agent/.env)

```bash
# AWS Region
AWS_REGION=us-east-1

# AgentCore Memory
AGENTCORE_MEMORY_ID=memory-id

# AgentCore Gateway
AGENTCORE_GATEWAY_ENDPOINT=https://xxx.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp

# User Storage
USER_STORAGE_BUCKET_NAME=bucket-name

# Server Configuration
PORT=8080
NODE_ENV=development
```

### スクリプトの仕組み

`scripts/setup-env.ts` は以下の処理を行います：

1. **スタック名の決定**
   - 環境変数 `STACK_NAME` または デフォルト値 `AgentCoreStack` を使用

2. **CloudFormation 出力の取得**
   - AWS SDK を使用して `DescribeStacks` API を呼び出し
   - 必要な Output 値を抽出

3. **`.env` ファイルの生成**
   - 各パッケージ用の環境変数を作成
   - ファイルに書き込み

4. **エラーハンドリング**
   - スタックが見つからない場合のエラーメッセージ
   - AWS 認証エラーの検出と対処法の表示
   - 必須 Output が欠けている場合の警告

## 🔧 トラブルシューティング

### エラー: スタックが見つかりません

```bash
❌ スタック出力の取得に失敗しました: Stack with id AgentCoreStack does not exist
```

**解決方法:**
1. スタック名が正しいか確認
2. スタックがデプロイされているか確認
3. AWS 認証情報が設定されているか確認

```bash
# スタック一覧を確認
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE

# 正しいスタック名を指定
STACK_NAME=YourActualStackName npm run setup-env
```

### エラー: AWS 認証情報がありません

```bash
❌ スタック出力の取得に失敗しました: Missing credentials in config
```

**解決方法:**

```bash
# AWS CLI を設定
aws configure

# または環境変数で指定
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=us-east-1
```

### 警告: 一部の出力が見つかりません

```bash
⚠️  警告: 以下の出力が見つかりません:
  - UserPoolId
  - UserPoolClientId
```

**原因:**
CDK スタックがこれらの Output を出力していない

**解決方法:**
1. CDK スタックを最新バージョンに更新
2. 再デプロイ: `npm run deploy`
3. `setup-env` を再実行

## 📋 CDK Output 一覧

以下の CloudFormation Output が `setup-env` で使用されます：

| Output Key | 用途 | 必須 |
|-----------|------|------|
| `Region` | AWS リージョン | ✅ |
| `UserPoolId` | Cognito User Pool ID | ✅ |
| `UserPoolClientId` | Cognito Client ID | ✅ |
| `MemoryId` | AgentCore Memory ID | ✅ |
| `GatewayMcpEndpoint` | AgentCore Gateway エンドポイント | ✅ |
| `UserStorageBucketName` | S3 バケット名 | ✅ |
| `BackendApiUrl` | Backend API URL | ❌ |
| `RuntimeInvocationEndpoint` | Runtime エンドポイント | ❌ |

## 🎨 カスタマイズ

### クラウド接続モードへの切り替え

生成された `.env` ファイルを編集して、クラウドリソースに直接接続できます：

```bash
# packages/frontend/.env を編集
# コメントアウトされている行を有効化
VITE_BACKEND_URL=https://xxx.execute-api.us-east-1.amazonaws.com
VITE_AGENT_ENDPOINT=https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/.../invocations
```

### 環境変数の追加

`scripts/setup-env.ts` を編集して、新しい環境変数を追加できます：

```typescript
interface StackOutputs {
  Region?: string;
  UserPoolId?: string;
  // ... 既存の定義
  YourNewOutput?: string;  // 新しい Output を追加
}

function createFrontendEnv(outputs: StackOutputs): string {
  return `
# 既存の環境変数
...

# 新しい環境変数
VITE_YOUR_NEW_VAR=${outputs.YourNewOutput || ''}
`;
}
```

## 🔗 関連ドキュメント

- [README.md](../README.md) - プロジェクト概要
- [jwt-authentication.md](./jwt-authentication.md) - JWT 認証システム
- [packages/agent/README.md](../packages/agent/README.md) - Agent 実装詳細
- [packages/backend/README.md](../packages/backend/README.md) - Backend API 詳細
- [packages/frontend/README.md](../packages/frontend/README.md) - Frontend 実装詳細

## 💡 ベストプラクティス

1. **デプロイ後は必ず `setup-env` を実行**
   ```bash
   npm run deploy && npm run setup-env
   ```

2. **`.env` ファイルはコミットしない**
   - 既に `.gitignore` に含まれています
   - 機密情報を含むため、Git にコミットしないでください

3. **定期的に環境変数を更新**
   - スタックを更新した後は `setup-env` を再実行
   ```bash
   npm run deploy && npm run setup-env && npm run dev
   ```

4. **スタック名を統一**
   - チーム全体で同じスタック名を使用
   - または `.env` で `STACK_NAME` を定義

5. **エラーログを確認**
   - `setup-env` が失敗した場合、エラーメッセージを確認
   - 必要に応じて AWS CLI でスタック状態を確認
