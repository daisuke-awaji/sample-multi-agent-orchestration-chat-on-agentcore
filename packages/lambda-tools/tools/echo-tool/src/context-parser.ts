/**
 * AgentCore Gateway Context解析ユーティリティ
 */

import { Context } from 'aws-lambda';
import { logger } from './logger.js';

/**
 * Lambda ClientContext の型定義
 */
interface LambdaClientContext {
  custom?: {
    bedrockAgentCoreToolName?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * コンテキストからツール名を安全に抽出する
 *
 * @param context Lambda実行コンテキスト
 * @returns 抽出されたツール名、またはnull
 */
export function extractToolName(context: Context): string | null {
  try {
    // clientContextの存在確認
    if (!context.clientContext) {
      logger.info('CONTEXT', {
        status: 'no_client_context',
        invocationType: 'direct_or_unknown',
      });
      return null;
    }

    // customフィールドの存在確認（実際のAWS環境では小文字）
    const customContext = (context.clientContext as unknown as LambdaClientContext).custom;

    if (!customContext) {
      logger.info('CONTEXT', {
        status: 'no_custom_context',
        clientContext: context.clientContext,
      });
      return null;
    }

    // ツール名の取得
    const originalToolName = customContext.bedrockAgentCoreToolName as string;

    if (!originalToolName) {
      logger.info('CONTEXT', {
        status: 'no_tool_name',
        customKeys: Object.keys(customContext),
      });
      return null;
    }

    // Gateway Target プレフィックスを除去 (echo-tool___ping → ping)
    const processedToolName = extractActualToolName(originalToolName);

    logger.info('CONTEXT', {
      originalTool: originalToolName,
      processedTool: processedToolName,
      clientContext: context.clientContext,
    });

    return processedToolName;
  } catch (error) {
    logger.warn('CONTEXT_ERROR', {
      error,
      contextKeys: context.clientContext ? Object.keys(context.clientContext) : [],
    });
    return null;
  }
}

/**
 * ツール名からプレフィックスを除去する
 *
 * @param toolName 完全なツール名（例: "echo-tool___echo"）
 * @returns 実際のツール名（例: "echo"）
 */
export function extractActualToolName(toolName: string): string {
  const delimiter = '___';

  if (toolName && toolName.includes(delimiter)) {
    return toolName.substring(toolName.indexOf(delimiter) + delimiter.length);
  }

  return toolName;
}

/**
 * コンテキストの詳細情報をログ出力用に整理する
 *
 * @param context Lambda実行コンテキスト
 * @returns ログ出力用の整理されたコンテキスト情報
 */
export function getContextSummary(context: Context) {
  return {
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    memoryLimit: context.memoryLimitInMB,
    remainingTime: context.getRemainingTimeInMillis(),
    hasClientContext: !!context.clientContext,
    clientContextKeys: context.clientContext ? Object.keys(context.clientContext) : [],
  };
}
