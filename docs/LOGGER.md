# 統一ロガー (Unified Logger)

## 概要

プロジェクト全体で統一された構造化ロギングを提供するロガーモジュールです。

## 特徴

✅ **構造化ロギング**: JSON形式で本番環境のログ分析に最適  
✅ **ログレベル制御**: debug, info, warn, error の4段階  
✅ **コンテキスト管理**: requestId, userId等を自動付与  
✅ **環境別出力**: 開発環境は人間可読、本番環境はJSON  
✅ **子ロガー**: コンテキストを継承した子ロガーの作成  
✅ **型安全**: TypeScriptで完全に型付け

## 使い方

### 基本的な使い方

```typescript
import { logger } from './utils/logger';

// 情報ログ
logger.info('処理開始', { userId: 'user-123', count: 5 });

// エラーログ
logger.error('処理失敗', { error, agentId: 'agent-456' });

// 警告ログ
logger.warn('設定が不正です', { configKey: 'API_KEY' });

// デバッグログ（LOG_LEVEL=debug の時のみ出力）
logger.debug('デバッグ情報', { requestBody });
```

### 子ロガー（コンテキスト継承）

```typescript
// リクエストごとにコンテキスト付きロガーを作成
const requestLogger = logger.child({
  requestId: 'req-123',
  userId: 'user-456',
});

// requestIdとuserIdが自動で付与される
requestLogger.info('Agent取得開始');
requestLogger.error('Agent取得失敗', { agentId: 'agent-789' });
```

### Express ミドルウェア

```typescript
import { requestLoggerMiddleware, enrichLoggerWithAuth } from './middleware/logger-middleware';
import { jwtAuthMiddleware } from './middleware/auth';

// リクエストロギング（全エンドポイントに適用）
app.use(requestLoggerMiddleware);

// 認証後にロガーにユーザー情報を追加
app.use('/api', jwtAuthMiddleware, enrichLoggerWithAuth);

// ルートハンドラー内で使用
app.get('/agents', (req, res) => {
  req.logger.info('Agent一覧取得', { count: 5 });
  // ...
});
```

## 環境変数

### LOG_LEVEL

ログレベルを制御します。

- `debug`: すべてのログを出力
- `info`: info, warn, error を出力（デフォルト）
- `warn`: warn, error を出力
- `error`: error のみ出力

```bash
# 開発環境
LOG_LEVEL=debug

# 本番環境
LOG_LEVEL=info
```

### NODE_ENV

出力形式を制御します。

- `development`: 人間が読みやすい形式（絵文字付き）
- `production`: JSON形式（CloudWatch Logs Insights用）

## ログ出力例

### 開発環境（NODE_ENV=development）

```
ℹ️  [INFO] 2025-12-31T08:00:00.000Z [reqId: req_123, userId: user-456] Agent一覧取得開始 {"count":5}
❌ [ERROR] 2025-12-31T08:00:01.000Z [reqId: req_123, userId: user-456] Agent取得失敗 {"agentId":"agent-789"}
  Error: Agent not found
  Stack: Error: Agent not found at ...
```

### 本番環境（NODE_ENV=production）

```json
{"level":"info","timestamp":"2025-12-31T08:00:00.000Z","message":"Agent一覧取得開始","context":{"requestId":"req_123","userId":"user-456"},"metadata":{"count":5},"service":"agentcore-backend"}
{"level":"error","timestamp":"2025-12-31T08:00:01.000Z","message":"Agent取得失敗","context":{"requestId":"req_123","userId":"user-456"},"metadata":{"agentId":"agent-789"},"error":{"name":"Error","message":"Agent not found","stack":"Error: Agent not found at ..."},"service":"agentcore-backend"}
```

## CloudWatch Logs Insights クエリ例

```sql
-- エラーログのみ抽出
fields timestamp, message, error.message, context.userId
| filter level = "error"
| sort timestamp desc

-- 特定ユーザーのログ
fields timestamp, level, message, metadata
| filter context.userId = "user-123"
| sort timestamp desc

-- レスポンス時間が長いリクエスト
fields timestamp, message, metadata.duration, metadata.statusCode
| filter message = "Request completed" and metadata.duration > 1000
| sort metadata.duration desc
```

## ベストプラクティス

### ✅ 推奨

```typescript
// メタデータを第二引数で渡す
logger.info('Agent作成成功', { agentId, userId, name });

// エラーオブジェクトはerrorキーで渡す
logger.error('Agent作成失敗', { error, agentId });

// 子ロガーでコンテキストを管理
const scopedLogger = logger.child({ requestId, userId });
scopedLogger.info('処理開始');
```

### ❌ 非推奨

```typescript
// メッセージに変数を埋め込まない（検索性が低下）
logger.info(`Agent ${agentId} を作成しました`);

// console.log を直接使わない
console.log('処理開始');

// 構造化されていない文字列
logger.info(JSON.stringify({ message: 'test', data: {} }));
```

## 移行ガイド

### 既存のconsole.logから移行

```typescript
// Before
console.log(`📋 Agent一覧取得開始 (${requestId}):`, { userId, count });
console.error(`💥 Agent取得エラー (${requestId}):`, error);

// After
logger.info('Agent一覧取得開始', { requestId, userId, count });
logger.error('Agent取得エラー', { requestId, error });
```

### Agent の既存loggerから移行

```typescript
// Before
logger.info('設定値:', config);
logger.debug('デバッグ情報:', data);

// After
logger.info('設定値検証完了', { config });
logger.debug('デバッグ情報', { data });
```

## トラブルシューティング

### ログが出力されない

`LOG_LEVEL` 環境変数を確認してください。

```bash
# すべてのログを出力
export LOG_LEVEL=debug
```

### 本番環境でJSON形式にならない

`NODE_ENV=production` が設定されているか確認してください。

```bash
export NODE_ENV=production
```

## 参考資料

- [構造化ロギングのベストプラクティス](https://www.loggly.com/ultimate-guide/node-logging-basics/)
- [CloudWatch Logs Insights クエリ構文](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html)
