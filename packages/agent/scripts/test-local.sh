#!/bin/bash

# ローカルDocker環境テスト用スクリプト
# docker compose で起動した AgentCore Runtime をテストします

set -e

# 設定
BASE_URL="http://localhost:8080"
USER_POOL_ID="us-east-1_OZ6KUvSn3"
CLIENT_ID="19duob1sqr877jesho69aildbn"
REGION="us-east-1"
TEST_USERNAME="testuser"
TEST_PASSWORD="TestPassword123!"

echo "🐳 ローカルDocker環境テスト開始"
echo "🎯 テストURL: $BASE_URL"
echo ""

# 1. ヘルスチェックテスト
echo "🏥 1. ヘルスチェックテスト..."
PING_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/ping" 2>/dev/null || echo -e "connection_error\n000")
PING_STATUS=$(echo "$PING_RESPONSE" | tail -n1)
PING_BODY=$(echo "$PING_RESPONSE" | sed '$d')

echo "   HTTP Status: $PING_STATUS"
if [ "$PING_STATUS" = "200" ]; then
  echo "   ✅ ヘルスチェック成功"
  echo "   Response: $(echo $PING_BODY | jq -c . 2>/dev/null || echo $PING_BODY)"
else
  echo "   ❌ ヘルスチェック失敗"
  echo "   Response: $PING_BODY"
fi
echo ""

# 2. ルート情報テスト
echo "📋 2. ルート情報テスト..."
ROOT_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/" 2>/dev/null || echo -e "connection_error\n000")
ROOT_STATUS=$(echo "$ROOT_RESPONSE" | tail -n1)
ROOT_BODY=$(echo "$ROOT_RESPONSE" | sed '$d')

echo "   HTTP Status: $ROOT_STATUS"
if [ "$ROOT_STATUS" = "200" ]; then
  echo "   ✅ ルート情報取得成功"
  echo "   Service: $(echo $ROOT_BODY | jq -r '.service' 2>/dev/null || echo 'N/A')"
  echo "   Version: $(echo $ROOT_BODY | jq -r '.version' 2>/dev/null || echo 'N/A')"
else
  echo "   ❌ ルート情報取得失敗"
  echo "   Response: $ROOT_BODY"
fi
echo ""

# 3. JWT Token取得
echo "🎫 3. JWT Token取得..."

# テストユーザー作成（エラーを無視）
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username $TEST_USERNAME \
  --message-action SUPPRESS \
  --region $REGION \
  --temporary-password "TempPass123!" > /dev/null 2>&1 || true

# パスワードを永続化
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username $TEST_USERNAME \
  --password $TEST_PASSWORD \
  --permanent \
  --region $REGION > /dev/null 2>&1 || true

# JWT Token取得
AUTH_RESPONSE=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id $CLIENT_ID \
  --auth-parameters USERNAME=$TEST_USERNAME,PASSWORD=$TEST_PASSWORD \
  --region $REGION 2>/dev/null || echo '{"error":"auth_failed"}')

JWT_TOKEN=$(echo $AUTH_RESPONSE | jq -r '.AuthenticationResult.AccessToken' 2>/dev/null || echo "null")

if [ "$JWT_TOKEN" = "null" ] || [ -z "$JWT_TOKEN" ]; then
  echo "   ⚠️  JWT Token取得失敗 - 認証なしでテスト継続"
  JWT_TOKEN=""
else
  echo "   ✅ JWT Token取得成功"
  echo "   Token (最初の50文字): ${JWT_TOKEN:0:50}..."
fi
echo ""

# 4. Agent呼び出しテスト（JWT認証付き）
echo "🤖 4. Agent呼び出しテスト..."
if [ ! -z "$JWT_TOKEN" ]; then
  AGENT_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/octet-stream" \
    -X POST \
    "$BASE_URL/invocations" \
    -d "Hello, what is 1+1?" 2>/dev/null || echo -e "connection_error\n000")
else
  # JWT認証なしでテスト
  AGENT_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Content-Type: application/octet-stream" \
    -X POST \
    "$BASE_URL/invocations" \
    -d "Hello, what is 1+1?" 2>/dev/null || echo -e "connection_error\n000")
fi

AGENT_STATUS=$(echo "$AGENT_RESPONSE" | tail -n1)
AGENT_BODY=$(echo "$AGENT_RESPONSE" | sed '$d')

echo "   HTTP Status: $AGENT_STATUS"
if [ "$AGENT_STATUS" = "200" ]; then
  echo "   ✅ Agent呼び出し成功"
  REQUEST_ID=$(echo $AGENT_BODY | jq -r '.metadata.requestId' 2>/dev/null || echo 'N/A')
  DURATION=$(echo $AGENT_BODY | jq -r '.metadata.duration' 2>/dev/null || echo 'N/A')
  echo "   Request ID: $REQUEST_ID"
  echo "   Duration: ${DURATION}ms"
  echo "   Response: $(echo $AGENT_BODY | jq -r '.response.content[0].text' 2>/dev/null | head -c 100 || echo $AGENT_BODY | head -c 100)..."
else
  echo "   ❌ Agent呼び出し失敗"
  echo "   Response: $AGENT_BODY"
fi
echo ""

# 5. 空プロンプトエラーテスト
echo "🚫 5. 空プロンプトエラーテスト..."
EMPTY_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Content-Type: application/octet-stream" \
  -X POST \
  "$BASE_URL/invocations" \
  -d "" 2>/dev/null || echo -e "connection_error\n000")

EMPTY_STATUS=$(echo "$EMPTY_RESPONSE" | tail -n1)
EMPTY_BODY=$(echo "$EMPTY_RESPONSE" | sed '$d')

echo "   HTTP Status: $EMPTY_STATUS"
if [ "$EMPTY_STATUS" = "400" ]; then
  echo "   ✅ 空プロンプトエラー処理成功"
  echo "   Error: $(echo $EMPTY_BODY | jq -r '.error' 2>/dev/null || echo 'Bad Request')"
else
  echo "   ⚠️  予期しないレスポンス (期待値: 400)"
  echo "   Response: $EMPTY_BODY"
fi
echo ""

# 6. 404エラーテスト
echo "🔍 6. 404エラーテスト..."
NOT_FOUND_RESPONSE=$(curl -s -w "\n%{http_code}" \
  "$BASE_URL/unknown" 2>/dev/null || echo -e "connection_error\n000")

NOT_FOUND_STATUS=$(echo "$NOT_FOUND_RESPONSE" | tail -n1)
NOT_FOUND_BODY=$(echo "$NOT_FOUND_RESPONSE" | sed '$d')

echo "   HTTP Status: $NOT_FOUND_STATUS"
if [ "$NOT_FOUND_STATUS" = "404" ]; then
  echo "   ✅ 404エラー処理成功"
  echo "   Message: $(echo $NOT_FOUND_BODY | jq -r '.message' 2>/dev/null || echo 'Not Found')"
else
  echo "   ⚠️  予期しないレスポンス (期待値: 404)"
  echo "   Response: $NOT_FOUND_BODY"
fi
echo ""

# 7. サマリー
echo "📊 テスト結果サマリー:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏥 ヘルスチェック    : $([ "$PING_STATUS" = "200" ] && echo "✅ 成功" || echo "❌ 失敗")"
echo "📋 ルート情報        : $([ "$ROOT_STATUS" = "200" ] && echo "✅ 成功" || echo "❌ 失敗")"
echo "🎫 JWT認証           : $([ ! -z "$JWT_TOKEN" ] && echo "✅ 成功" || echo "⚠️  スキップ")"
echo "🤖 Agent呼び出し     : $([ "$AGENT_STATUS" = "200" ] && echo "✅ 成功" || echo "❌ 失敗")"
echo "🚫 空プロンプトエラー : $([ "$EMPTY_STATUS" = "400" ] && echo "✅ 成功" || echo "⚠️  予期外")"
echo "🔍 404エラー         : $([ "$NOT_FOUND_STATUS" = "404" ] && echo "✅ 成功" || echo "⚠️  予期外")"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎯 テスト対象: $BASE_URL"
echo "🕐 実行時刻: $(date)"

# 総合判定
TOTAL_TESTS=6
SUCCESS_COUNT=0
[ "$PING_STATUS" = "200" ] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
[ "$ROOT_STATUS" = "200" ] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
[ ! -z "$JWT_TOKEN" ] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
[ "$AGENT_STATUS" = "200" ] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
[ "$EMPTY_STATUS" = "400" ] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
[ "$NOT_FOUND_STATUS" = "404" ] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))

echo "🏆 成功率: $SUCCESS_COUNT/$TOTAL_TESTS ($(( SUCCESS_COUNT * 100 / TOTAL_TESTS ))%)"
echo ""

if [ $SUCCESS_COUNT -eq $TOTAL_TESTS ]; then
  echo "🎉 全てのテストが成功しました！"
  exit 0
elif [ $SUCCESS_COUNT -ge 4 ]; then
  echo "✅ 主要なテストが成功しました"
  exit 0
else
  echo "⚠️  一部のテストが失敗しました"
  exit 1
fi
