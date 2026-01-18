# Slack Webhook to EventBridge

Slack の Webhook イベントを受信し、AWS EventBridge (default bus) に転送する独立したスタックです。

## アーキテクチャ

```
Slack → API Gateway (HTTP API) → Lambda → EventBridge (default bus)
                                              ↓
                               既存の EventBridge ルール → TriggerLambda → Agent
```

## セットアップ

### 1. Slack Signing Secret を Secrets Manager に登録

```bash
aws secretsmanager create-secret \
  --name "agentcore/slack-signing-secret" \
  --secret-string "YOUR_SLACK_SIGNING_SECRET" \
  --region ap-northeast-1
```

Slack Signing Secret は [Slack App Settings](https://api.slack.com/apps) > Basic Information > App Credentials から取得できます。

### 2. スタックをデプロイ

```bash
# デフォルト設定でデプロイ
npm run deploy:slack-webhook

# カスタム設定でデプロイ
cd packages/cdk && cdk deploy SlackWebhookStack \
  --app 'npx ts-node bin/slack-webhook.ts' \
  -c slackSigningSecretName=my-custom-secret-name \
  -c resourcePrefix=my-slack-webhook \
  -c region=us-east-1
```

### 3. Slack App の設定

1. [Slack API](https://api.slack.com/apps) でアプリを作成または選択
2. **Event Subscriptions** を有効化
3. **Request URL** にデプロイ後に出力される `WebhookUrl` を設定
4. **Subscribe to bot events** で受け取りたいイベントを選択:
   - `message.channels` - チャンネルメッセージ
   - `message.im` - DM メッセージ
   - `reaction_added` - リアクション追加
   - `app_mention` - アプリへのメンション
   - など
5. アプリをワークスペースにインストール

## EventBridge ルールの設定

メインの AgentCore スタック (`environments.ts`) で Slack イベントをトリガーとして使用する例:

```typescript
eventRules: [
  {
    id: 'slack-message',
    name: 'Slack Message',
    description: 'Triggered when a message is posted in Slack',
    eventPattern: {
      source: ['slack'],
      detailType: ['message'],
    },
    icon: 'message-circle',
    enabled: true,
  },
  {
    id: 'slack-app-mention',
    name: 'Slack App Mention',
    description: 'Triggered when the bot is mentioned in Slack',
    eventPattern: {
      source: ['slack'],
      detailType: ['app_mention'],
    },
    icon: 'at-sign',
    enabled: true,
  },
]
```

## イベント形式

EventBridge に送信されるイベントの形式:

```json
{
  "source": "slack",
  "detail-type": "message",
  "detail": {
    "type": "event_callback",
    "team_id": "T12345678",
    "api_app_id": "A12345678",
    "event": {
      "type": "message",
      "user": "U12345678",
      "channel": "C12345678",
      "text": "Hello, world!",
      "ts": "1234567890.123456"
    },
    "event_id": "Ev12345678",
    "event_time": 1234567890
  }
}
```

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `SLACK_SIGNING_SECRET_NAME` | Secrets Manager のシークレット名 | - |

## スタックの削除

```bash
npm run destroy:slack-webhook
```

## セキュリティ

- Slack Signing Secret を使用したリクエスト署名検証
- タイムスタンプチェックによるリプレイ攻撃防止（5分以内）
- Secrets Manager によるシークレット管理
