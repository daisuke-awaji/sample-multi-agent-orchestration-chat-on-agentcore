/**
 * Echo ツール実装
 *
 * 入力されたメッセージをそのまま返すツール
 */

import { ToolInput, ToolResult } from '../types.js';
import { Tool, ToolValidationError } from './types.js';
import { logger } from '../logger.js';

/**
 * Echoツールの入力型
 */
interface EchoInput extends ToolInput {
  message?: string;
}

/**
 * Echoツールの出力型
 */
interface EchoResult extends ToolResult {
  echo: string;
  length: number;
  uppercase: string;
  lowercase: string;
}

/**
 * Echoツールのメイン処理
 *
 * @param input 入力データ
 * @returns Echoの実行結果
 */
async function handleEcho(input: ToolInput): Promise<EchoResult> {
  const echoInput = input as EchoInput;

  // 入力検証
  if (!echoInput.message) {
    throw new ToolValidationError("Echo tool requires a 'message' parameter", 'echo', 'message');
  }

  const message = echoInput.message;

  // メッセージの特性を分析
  const messageAnalysis = analyzeMessage(message);

  // ログ出力
  logger.debug('ECHO_RESULT', {
    messageLength: message.length,
    ...messageAnalysis,
  });

  // 結果を生成
  const result: EchoResult = {
    echo: message,
    length: message.length,
    uppercase: message.toUpperCase(),
    lowercase: message.toLowerCase(),
  };

  return result;
}

/**
 * メッセージの特性を分析する
 *
 * @param message 分析対象のメッセージ
 * @returns メッセージの特性情報
 */
function analyzeMessage(message: string) {
  return {
    hasUppercase: /[A-Z]/.test(message),
    hasLowercase: /[a-z]/.test(message),
    hasNumbers: /\d/.test(message),
    hasSpecialChars: /[^a-zA-Z0-9\s]/.test(message),
    wordCount: message.trim().split(/\s+/).length,
    charCount: message.length,
    whitespaceCount: (message.match(/\s/g) || []).length,
  };
}

/**
 * Echoツールの定義
 */
export const echoTool: Tool = {
  name: 'echo',
  handler: handleEcho,
  description: 'Echo back the input message with additional transformations',
  version: '1.0.0',
  tags: ['utility', 'text-processing'],
};

export default echoTool;
