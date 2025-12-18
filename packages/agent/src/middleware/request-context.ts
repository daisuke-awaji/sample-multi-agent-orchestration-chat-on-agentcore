/**
 * Request Context Middleware
 * リクエストコンテキストを設定するExpressミドルウェア
 */

import { Request, Response, NextFunction } from "express";
import {
  createRequestContext,
  runWithContext,
} from "../context/request-context.js";

/**
 * リクエストコンテキストを設定するミドルウェア
 * Authorization ヘッダーを抽出し、AsyncLocalStorage でコンテキストを設定
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Authorization ヘッダーを複数のソースから取得
  const authHeader =
    req.headers.authorization ||
    (req.headers[
      "x-amzn-bedrock-agentcore-runtime-custom-authorization"
    ] as string);

  // リクエストコンテキストを作成
  const requestContext = createRequestContext(authHeader);

  // デバッグログ
  console.log(`📝 Request context middleware activated:`, {
    requestId: requestContext.requestId,
    hasAuth: !!authHeader,
    authType: authHeader?.split(" ")[0] || "None",
    path: req.path,
    method: req.method,
  });

  // AsyncLocalStorage でコンテキストを設定して next() を実行
  runWithContext(requestContext, () => {
    next();
  });
}
