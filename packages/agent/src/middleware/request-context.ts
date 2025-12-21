/**
 * Request Context Middleware
 * リクエストコンテキストを設定するExpressミドルウェア
 */

import { Request, Response, NextFunction } from 'express';
import { createRequestContext, runWithContext } from '../context/request-context.js';

/**
 * JWT から userId を抽出する（簡易実装）
 * 本格的な実装では jwt ライブラリを使用することを推奨
 */
function extractUserIdFromJWT(authHeader?: string): string | undefined {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return undefined;
  }

  try {
    const token = authHeader.substring(7); // 'Bearer ' を削除
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

    // 一般的な JWT クレームから userId を抽出
    return payload.sub || payload.userId || payload.user_id || payload.username;
  } catch (error) {
    console.warn('JWT の解析に失敗:', error);
    return undefined;
  }
}

/**
 * リクエストコンテキストを設定するミドルウェア
 * Authorization ヘッダーを抽出し、AsyncLocalStorage でコンテキストを設定
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Authorization ヘッダーを複数のソースから取得
  const authHeader =
    req.headers.authorization ||
    (req.headers['x-amzn-bedrock-agentcore-runtime-custom-authorization'] as string);

  // JWT から userId を抽出
  const userId = extractUserIdFromJWT(authHeader);

  // リクエストコンテキストを作成
  const requestContext = createRequestContext(authHeader);
  // userId を設定
  if (userId) {
    requestContext.userId = userId;
  }

  // デバッグログ
  console.log(`📝 Request context middleware activated:`, {
    requestId: requestContext.requestId,
    userId: requestContext.userId,
    hasAuth: !!authHeader,
    authType: authHeader?.split(' ')[0] || 'None',
    path: req.path,
    method: req.method,
  });

  // AsyncLocalStorage でコンテキストを設定して next() を実行
  runWithContext(requestContext, () => {
    next();
  });
}
