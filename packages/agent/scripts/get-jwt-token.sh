#!/bin/bash

# Cognito JWT Token 取得スクリプト
# AgentCore Runtime のテスト用にCognitoからJWTトークンを取得します

set -e

# 設定
USER_POOL_ID="us-east-1_OZ6KUvSn3"
CLIENT_ID="19duob1sqr877jesho69aildbn"
REGION="us-east-1"
TEST_USERNAME="testuser"
TEST_PASSWORD="TestPassword123!"

echo "🎫 Cognito JWT Token 取得開始"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 設定情報:"
echo "   User Pool ID: $USER_POOL_ID"
echo "   Client ID: $CLIENT_ID"
echo "   Region: $REGION"
echo "   Username: $TEST_USERNAME"
echo ""

# 1. テストユーザー作成（エラーを無視）
echo "👤 1. テストユーザー準備中..."
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username $TEST_USERNAME \
  --message-action SUPPRESS \
  --region $REGION \
  --temporary-password "TempPass123!" > /dev/null 2>&1 || true

# 2. パスワードを永続化
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username $TEST_USERNAME \
  --password $TEST_PASSWORD \
  --permanent \
  --region $REGION > /dev/null 2>&1 || true

echo "   ✅ テストユーザー準備完了"
echo ""

# 3. JWT Token取得
echo "🔐 2. JWT Token認証実行中..."
AUTH_RESPONSE=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id $CLIENT_ID \
  --auth-parameters USERNAME=$TEST_USERNAME,PASSWORD=$TEST_PASSWORD \
  --region $REGION 2>/dev/null || echo '{"error":"auth_failed"}')

# JWT Tokenの抽出
ACCESS_TOKEN=$(echo $AUTH_RESPONSE | jq -r '.AuthenticationResult.AccessToken' 2>/dev/null || echo "null")
ID_TOKEN=$(echo $AUTH_RESPONSE | jq -r '.AuthenticationResult.IdToken' 2>/dev/null || echo "null")
REFRESH_TOKEN=$(echo $AUTH_RESPONSE | jq -r '.AuthenticationResult.RefreshToken' 2>/dev/null || echo "null")
EXPIRES_IN=$(echo $AUTH_RESPONSE | jq -r '.AuthenticationResult.ExpiresIn' 2>/dev/null || echo "null")

echo ""
echo "🎯 結果:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$ACCESS_TOKEN" = "null" ] || [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ JWT Token取得失敗"
  echo ""
  echo "🔍 認証レスポンス:"
  echo "$AUTH_RESPONSE" | jq . 2>/dev/null || echo "$AUTH_RESPONSE"
  echo ""
  echo "💡 トラブルシューティング:"
  echo "   1. AWS認証情報が設定されているか確認"
  echo "   2. User Pool ID・Client IDが正しいか確認"
  echo "   3. リージョンが正しいか確認"
  echo "   4. ユーザーが存在するか確認"
  exit 1
else
  echo "✅ JWT Token取得成功！"
  echo ""
  echo "📊 トークン情報:"
  echo "   有効期限: ${EXPIRES_IN}秒"
  echo "   取得時刻: $(date)"
  echo ""
  echo "🎫 Access Token:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "$ACCESS_TOKEN"
  echo ""
  echo "🆔 ID Token:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "$ID_TOKEN"
  echo ""
  if [ "$REFRESH_TOKEN" != "null" ]; then
    echo "🔄 Refresh Token:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "$REFRESH_TOKEN"
    echo ""
  fi
  
  echo "📋 使用例:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "# AgentCore Runtime呼び出し例:"
  echo "curl -H \"Authorization: Bearer $ACCESS_TOKEN\" \\"
  echo "     -H \"Content-Type: application/octet-stream\" \\"
  echo "     -X POST \\"
  echo "     http://localhost:8080/invocations \\"
  echo "     -d \"なんのツールが使える？\""
  echo ""
  echo "# 環境変数として設定:"
  echo "export JWT_TOKEN=\"$ACCESS_TOKEN\""
  echo ""
fi

echo "🕐 実行完了時刻: $(date)"
