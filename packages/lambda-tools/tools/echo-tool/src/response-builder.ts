/**
 * AgentCore Gateway レスポンス生成ユーティリティ
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { ToolResult, AgentCoreResponse } from './types.js';

/**
 * 共通のCORSヘッダー
 */
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * 成功レスポンスを生成する
 *
 * @param result ツールの実行結果
 * @param toolName 実行されたツール名
 * @param requestId リクエストID
 * @param timestamp タイムスタンプ
 * @returns APIGatewayProxyResult
 */
export function createSuccessResponse(
  result: ToolResult,
  toolName: string | null,
  requestId: string,
  timestamp: string
): APIGatewayProxyResult {
  const responseBody: AgentCoreResponse = {
    result,
    metadata: {
      timestamp,
      requestId,
      toolName: toolName || 'unknown',
    },
  };

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify(responseBody),
  };
}

/**
 * エラーレスポンスを生成する
 *
 * @param error エラーオブジェクトまたはメッセージ
 * @param toolName 実行予定だったツール名
 * @param requestId リクエストID
 * @param timestamp タイムスタンプ
 * @returns APIGatewayProxyResult
 */
export function createErrorResponse(
  error: unknown,
  toolName: string | null,
  requestId: string,
  timestamp: string
): APIGatewayProxyResult {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

  const responseBody: AgentCoreResponse = {
    result: null,
    error: errorMessage,
    metadata: {
      timestamp,
      requestId,
      toolName: toolName || 'unknown',
    },
  };

  return {
    statusCode: 500,
    headers: CORS_HEADERS,
    body: JSON.stringify(responseBody),
  };
}

/**
 * OPTIONSリクエスト用のレスポンスを生成する（CORS プリフライト対応）
 *
 * @returns APIGatewayProxyResult
 */
export function createOptionsResponse(): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: '',
  };
}

/**
 * レスポンスのサイズを計算する
 *
 * @param response APIGatewayProxyResult
 * @returns レスポンスボディのバイト数
 */
export function calculateResponseSize(response: APIGatewayProxyResult): number {
  return new TextEncoder().encode(response.body).length;
}

/**
 * レスポンスのメタデータを抽出する（ログ用）
 *
 * @param response APIGatewayProxyResult
 * @param toolResult ツールの実行結果
 * @returns ログ用メタデータ
 */
export function extractResponseMetadata(response: APIGatewayProxyResult, toolResult?: ToolResult) {
  return {
    statusCode: response.statusCode,
    responseSize: response.body.length,
    resultKeys: toolResult ? Object.keys(toolResult) : [],
    hasError: response.statusCode !== 200,
  };
}
