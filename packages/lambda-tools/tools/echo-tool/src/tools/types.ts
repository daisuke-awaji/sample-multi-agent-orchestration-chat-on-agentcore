/**
 * ツール共通型定義
 */

import { ToolInput, ToolResult } from '../types.js';

/**
 * ツールハンドラー関数の型
 */
export type ToolHandler = (input: ToolInput) => Promise<ToolResult>;

/**
 * ツール定義の基本構造
 */
export interface Tool {
  /** ツール名 */
  name: string;
  /** ツールハンドラー関数 */
  handler: ToolHandler;
  /** ツールの説明（オプション） */
  description?: string;
  /** ツールのバージョン（オプション） */
  version?: string;
  /** ツールのタグ（オプション） */
  tags?: string[];
}

/**
 * ツール実行コンテキスト
 */
export interface ToolExecutionContext {
  /** 実行開始時刻 */
  startTime: number;
  /** ツール名 */
  toolName: string;
  /** 入力データのサイズ（バイト） */
  inputSize: number;
}

/**
 * ツール実行結果のメタデータ
 */
export interface ToolExecutionResult {
  /** 実行結果 */
  result: ToolResult;
  /** 実行コンテキスト */
  context: ToolExecutionContext;
  /** 実行時間（ミリ秒） */
  executionTimeMs: number;
  /** 出力データのサイズ（バイト） */
  outputSize: number;
}

/**
 * ツールエラーの基本型
 */
export class ToolError extends Error {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

/**
 * 入力検証エラー
 */
export class ToolValidationError extends ToolError {
  constructor(
    message: string,
    toolName: string,
    public readonly field?: string
  ) {
    super(message, toolName);
    this.name = 'ToolValidationError';
  }
}
