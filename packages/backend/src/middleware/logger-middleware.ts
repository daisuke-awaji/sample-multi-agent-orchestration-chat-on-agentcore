/**
 * Logger Middleware for Express
 * リクエストロギングとコンテキスト管理を行うミドルウェア
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import type { Logger as LoggerType } from '../utils/logger.js';
import type { AuthenticatedRequest } from './auth.js';

/**
 * リクエストIDを生成
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * ロガー付きリクエスト型定義
 */
export interface RequestWithLogger extends Request {
  logger?: LoggerType;
  requestId?: string;
}

/**
 * リクエストロギングミドルウェア
 * 各リクエストにロガーとrequestIdを付与し、リクエスト/レスポンスをログ出力
 */
export function requestLoggerMiddleware(
  req: RequestWithLogger,
  res: Response,
  next: NextFunction
): void {
  const requestId = generateRequestId();
  const startTime = Date.now();

  // リクエストにrequestIdを付与
  req.requestId = requestId;

  // 初期コンテキストでロガーを作成
  req.logger = logger.child({ requestId });

  // リクエスト開始をログ
  req.logger.info('Request started', {
    method: req.method,
    path: req.path,
    userAgent: req.get('User-Agent')?.substring(0, 100),
    ip: req.ip,
  });

  // レスポンス終了時の処理
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    req.logger?.[level]('Request completed', {
      method: req.method,
      path: req.path,
      statusCode,
      duration,
    });
  });

  next();
}

/**
 * 認証情報をロガーコンテキストに追加するミドルウェア
 * jwtAuthMiddleware の後に使用
 */
export function enrichLoggerWithAuth(
  req: AuthenticatedRequest & RequestWithLogger,
  res: Response,
  next: NextFunction
): void {
  // 認証情報がある場合、ロガーに追加
  if (req.jwt && req.logger) {
    const userId = req.userId || req.jwt.sub || req.jwt['cognito:username'];
    const username = req.jwt['cognito:username'] || req.jwt.username;

    // 認証情報を含む新しい子ロガーを作成
    req.logger = req.logger.child({
      userId,
      username,
    });
  }

  next();
}

/**
 * リクエストからロガーを取得するヘルパー関数
 * ロガーが存在しない場合はグローバルロガーを返す
 */
export function getRequestLogger(req: RequestWithLogger): LoggerType {
  return req.logger || logger;
}
