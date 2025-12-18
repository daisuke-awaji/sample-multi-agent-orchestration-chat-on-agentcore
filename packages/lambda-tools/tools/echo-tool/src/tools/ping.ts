/**
 * Ping ツール実装
 *
 * 接続確認とシステム情報を返すツール
 */

import { ToolInput, ToolResult } from '../types.js';
import { Tool } from './types.js';
import { logger } from '../logger.js';

/**
 * Pingツールの出力型
 */
interface PingResult extends ToolResult {
  status: 'pong';
  timestamp: string;
  uptime: number;
  version: string;
  platform: string;
  arch: string;
  memory: NodeJS.MemoryUsage;
}

/**
 * Pingツールのメイン処理
 *
 * @param input 入力データ（Pingでは使用しない）
 * @returns Pingの実行結果
 */
async function handlePing(input: ToolInput): Promise<PingResult> {
  const memory = process.memoryUsage();
  const timestamp = new Date().toISOString();

  // ログ出力
  logger.debug('PING_RESULT', {
    uptime: Math.round(process.uptime()),
    nodeVersion: process.version,
    platform: process.platform,
    memoryMB: Math.round(memory.heapUsed / 1024 / 1024),
    memoryTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
    inputSize: input ? JSON.stringify(input).length : 0,
  });

  // 結果を生成
  const result: PingResult = {
    status: 'pong',
    timestamp,
    uptime: process.uptime(),
    version: process.version,
    platform: process.platform,
    arch: process.arch,
    memory,
  };

  return result;
}

/**
 * Pingツールの定義
 */
export const pingTool: Tool = {
  name: 'ping',
  handler: handlePing,
  description: 'Health check and system information tool',
  version: '1.0.0',
  tags: ['health-check', 'system-info', 'monitoring'],
};

export default pingTool;
