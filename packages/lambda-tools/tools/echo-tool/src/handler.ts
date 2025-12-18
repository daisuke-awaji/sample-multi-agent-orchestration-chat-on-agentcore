import { APIGatewayProxyResult, Context } from 'aws-lambda';
import { logger } from './logger.js';
import { extractToolName, getContextSummary } from './context-parser.js';
import { getToolHandler } from './tools/index.js';
import {
  createSuccessResponse,
  createErrorResponse,
  createOptionsResponse,
  extractResponseMetadata,
} from './response-builder.js';
import { ToolInput } from './types.js';

/**
 * AgentCore Gateway Echo/Ping Tool Lambda Handler
 *
 * このLambda関数はAgentCore Gatewayから呼び出され、
 * 登録されたツールを実行します。
 */

export async function handler(event: ToolInput, context: Context): Promise<APIGatewayProxyResult> {
  const reqId = context.awsRequestId;
  const timestamp = new Date().toISOString();

  // ロガーにリクエストIDを設定
  logger.setRequestId(reqId);

  // 開始ログ: リクエスト情報を記録
  const contextSummary = getContextSummary(context);
  logger.info('START', {
    timestamp,
    eventKeys: Object.keys(event),
    eventSize: JSON.stringify(event).length,
    ...contextSummary,
  });

  try {
    // コンテキストからツール名を抽出
    const toolName = extractToolName(context);

    // ツールハンドラーを取得
    const toolHandler = getToolHandler(toolName);

    // ツール実行ログ
    logger.info('TOOL_EXEC', {
      tool: toolName || 'ping',
      inputKeys: Object.keys(event),
      inputSize: JSON.stringify(event).length,
    });

    // ツールを実行
    const toolInput: ToolInput = event;
    const toolResult = await toolHandler(toolInput);

    // 成功レスポンスを生成
    const response = createSuccessResponse(toolResult, toolName, reqId, timestamp);

    // 成功ログ
    const responseMetadata = extractResponseMetadata(response, toolResult);
    logger.info('SUCCESS', {
      tool: toolName || 'ping',
      executionTime: context.getRemainingTimeInMillis(),
      ...responseMetadata,
    });

    return response;
  } catch (error) {
    // エラーログ
    logger.error('ERROR', {
      error,
      tool: extractToolName(context) || 'unknown',
      remainingTime: context.getRemainingTimeInMillis(),
    });

    // エラーレスポンスを生成
    return createErrorResponse(error, extractToolName(context), reqId, timestamp);
  }
}

/**
 * OPTIONS リクエスト用のハンドラー（CORS対応）
 */
export async function optionsHandler(): Promise<APIGatewayProxyResult> {
  return createOptionsResponse();
}
