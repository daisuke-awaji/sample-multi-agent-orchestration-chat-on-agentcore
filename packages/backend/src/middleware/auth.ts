/**
 * JWT Authentication Middleware
 * JWT認証を実行するExpressミドルウェア
 */

import { Request, Response, NextFunction } from 'express';
import { verifyJWT, extractJWTFromHeader, CognitoJWTPayload } from '../utils/jwks.js';
import { config } from '../config/index.js';

/**
 * 認証済みリクエストの型定義
 * Express Request オブジェクトにJWT情報を追加
 */
export interface AuthenticatedRequest extends Request {
  /** JWT ペイロード */
  jwt?: CognitoJWTPayload;
  /** ユーザーID */
  userId?: string;
  /** リクエストID（ログ追跡用） */
  requestId?: string;
}

/**
 * 認証エラーレスポンスの型定義
 */
interface AuthErrorResponse {
  error: string;
  message: string;
  code: string;
  timestamp: string;
  requestId?: string;
}

/**
 * リクエストIDを生成
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 認証エラーレスポンスを生成
 */
function createAuthErrorResponse(
  code: string,
  message: string,
  requestId: string
): AuthErrorResponse {
  return {
    error: 'Authentication Error',
    message,
    code,
    timestamp: new Date().toISOString(),
    requestId,
  };
}

/**
 * JWT認証ミドルウェア
 * Authorization ヘッダーの JWT を検証し、リクエストに認証情報を追加
 */
export function jwtAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const requestId = generateRequestId();
  req.requestId = requestId;

  console.log(`🔐 JWT認証開始 (${requestId}):`, {
    method: req.method,
    path: req.path,
    userAgent: req.get('User-Agent')?.substring(0, 50),
  });

  // Authorization ヘッダーを取得
  const authHeader = req.get('Authorization');

  if (!authHeader) {
    console.warn(`❌ Authorization ヘッダーが未設定 (${requestId})`);
    res
      .status(401)
      .json(
        createAuthErrorResponse(
          'MISSING_AUTHORIZATION',
          'Authorization header is required',
          requestId
        )
      );
    return;
  }

  // JWT トークンを抽出
  const token = extractJWTFromHeader(authHeader);

  if (!token) {
    console.warn(
      `❌ 無効なAuthorization ヘッダー形式 (${requestId}):`,
      authHeader.substring(0, 50)
    );
    res
      .status(401)
      .json(
        createAuthErrorResponse(
          'INVALID_AUTHORIZATION_FORMAT',
          'Authorization header must be in "Bearer <token>" format',
          requestId
        )
      );
    return;
  }

  // 本番環境では JWKS 検証、開発環境では設定に応じて処理を分岐
  if (config.isProduction || config.jwks.uri) {
    // JWKS検証を実行
    verifyJWT(token)
      .then((result) => {
        if (!result.valid) {
          console.warn(`❌ JWT検証失敗 (${requestId}):`, result.error);
          res
            .status(401)
            .json(
              createAuthErrorResponse(
                'INVALID_JWT',
                result.error || 'JWT verification failed',
                requestId
              )
            );
          return;
        }

        // 検証成功: リクエストに認証情報を追加
        req.jwt = result.payload;
        req.userId = result.payload?.sub || result.payload?.['cognito:username'];

        console.log(`✅ JWT認証成功 (${requestId}):`, {
          userId: req.userId,
          username: result.payload?.['cognito:username'],
          tokenUse: result.payload?.token_use,
        });

        next();
      })
      .catch((error) => {
        console.error(`💥 JWT検証エラー (${requestId}):`, error);
        res
          .status(500)
          .json(
            createAuthErrorResponse(
              'JWT_VERIFICATION_ERROR',
              'Internal error during JWT verification',
              requestId
            )
          );
      });
  } else {
    // 開発環境でJWKS未設定の場合は、デコードのみ実行（検証なし）
    console.warn(`⚠️  開発環境: JWKS未設定のため検証をスキップ (${requestId})`);

    try {
      // JWT を Base64 デコード（検証なし）
      const parts = token.split('.');
      if (parts.length !== 3) {
        res
          .status(401)
          .json(createAuthErrorResponse('INVALID_JWT_FORMAT', 'Invalid JWT format', requestId));
        return;
      }

      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      req.jwt = payload as CognitoJWTPayload;
      req.userId = payload.sub || payload['cognito:username'];

      console.log(`🔧 JWT デコード成功（検証なし） (${requestId}):`, {
        userId: req.userId,
        username: payload['cognito:username'],
        tokenUse: payload.token_use,
      });

      next();
    } catch (error) {
      console.error(`❌ JWT デコードエラー (${requestId}):`, error);
      res
        .status(401)
        .json(createAuthErrorResponse('JWT_DECODE_ERROR', 'Failed to decode JWT', requestId));
      return;
    }
  }
}

/**
 * オプショナル認証ミドルウェア
 * JWT が存在する場合のみ検証し、存在しない場合はスルー
 */
export function optionalJwtAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.get('Authorization');

  if (!authHeader) {
    // 認証ヘッダーが存在しない場合はスルー
    return next();
  }

  // 認証ヘッダーが存在する場合は通常の認証を実行
  return jwtAuthMiddleware(req, res, next);
}

/**
 * 現在の認証情報を取得するヘルパー関数
 */
export function getCurrentAuth(req: AuthenticatedRequest) {
  return {
    authenticated: !!req.jwt,
    userId: req.userId,
    username: req.jwt?.['cognito:username'],
    email: req.jwt?.email,
    groups: req.jwt?.['cognito:groups'] || [],
    tokenUse: req.jwt?.token_use,
    requestId: req.requestId,
  };
}
