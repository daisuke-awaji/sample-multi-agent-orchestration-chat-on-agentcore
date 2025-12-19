/**
 * JWKS (JSON Web Key Set) 検証ユーティリティ
 * Cognito User Pool のJWKSエンドポイントから公開鍵を取得してJWTを検証
 */

import { jwtVerify, createRemoteJWKSet, JWTPayload, JWTVerifyResult } from 'jose';
import { config } from '../config/index.js';

/**
 * JWT ペイロードの型定義
 */
export interface CognitoJWTPayload extends JWTPayload {
  /** Cognito Username */
  'cognito:username'?: string;
  /** Email */
  email?: string;
  /** Token Use (access or id) */
  token_use?: 'access' | 'id';
  /** Client ID */
  client_id?: string;
  /** Cognito Groups */
  'cognito:groups'?: string[];
  /** Auth Time */
  auth_time?: number;
}

/**
 * JWT 検証結果の型定義
 */
export interface JWTVerificationResult {
  /** 検証成功フラグ */
  valid: boolean;
  /** デコードされたペイロード */
  payload?: CognitoJWTPayload;
  /** エラーメッセージ */
  error?: string;
  /** エラー詳細 */
  details?: unknown;
}

/**
 * JWKS インスタンスをキャッシュ
 */
let jwksInstance: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * JWKS インスタンスを取得（遅延初期化）
 */
function getJWKS(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksInstance) {
    if (!config.jwks.uri) {
      throw new Error('JWKS URI が設定されていません');
    }

    console.log(`🔑 JWKS エンドポイントを初期化: ${config.jwks.uri}`);
    jwksInstance = createRemoteJWKSet(new URL(config.jwks.uri), {
      cacheMaxAge: config.jwks.cacheDuration,
    });
  }

  return jwksInstance;
}

/**
 * JWT トークンを検証
 * @param token JWT トークン（Bearer プレフィックスなし）
 * @returns 検証結果
 */
export async function verifyJWT(token: string): Promise<JWTVerificationResult> {
  try {
    // JWKS インスタンスを取得
    const JWKS = getJWKS();

    // JWT を検証
    const verifyOptions: any = {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      algorithms: ['RS256'],
    };

    // audienceが未設定の場合は検証をスキップ
    if (!verifyOptions.audience) {
      delete verifyOptions.audience;
    }

    const { payload }: JWTVerifyResult = await jwtVerify(token, JWKS, verifyOptions);

    console.log('✅ JWT 検証成功:', {
      sub: payload.sub,
      username: payload['cognito:username'],
      tokenUse: payload.token_use,
      exp: new Date((payload.exp || 0) * 1000).toISOString(),
    });

    return {
      valid: true,
      payload: payload as CognitoJWTPayload,
    };
  } catch (error) {
    console.warn('❌ JWT 検証失敗:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 50) + '...',
    });

    return {
      valid: false,
      error: error instanceof Error ? error.message : 'JWT verification failed',
      details: error,
    };
  }
}

/**
 * Authorization ヘッダーから JWT トークンを抽出
 * @param authHeader Authorization ヘッダー
 * @returns JWT トークン（Bearer プレフィックスなし）
 */
export function extractJWTFromHeader(authHeader: string): string | null {
  if (!authHeader) {
    return null;
  }

  // "Bearer " プレフィックスをチェック
  const bearerPrefix = 'Bearer ';
  if (!authHeader.startsWith(bearerPrefix)) {
    console.warn(
      '⚠️  Authorization ヘッダーが Bearer 形式ではありません:',
      authHeader.substring(0, 20)
    );
    return null;
  }

  // JWT トークン部分を抽出
  return authHeader.substring(bearerPrefix.length).trim();
}

/**
 * JWT をデコード（検証なし）
 * 開発環境やデバッグ用途
 * @param token JWT トークン
 * @returns デコード結果
 */
export function decodeJWTUnsafe(token: string): {
  payload: CognitoJWTPayload | null;
  error?: string;
} {
  try {
    // JWTは3つの部分（header.payload.signature）に分かれている
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { payload: null, error: 'Invalid JWT format' };
    }

    // Base64URL デコード
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

    return { payload: payload as CognitoJWTPayload };
  } catch (error) {
    return {
      payload: null,
      error: error instanceof Error ? error.message : 'Decode failed',
    };
  }
}

/**
 * JWKS 設定状況を確認
 */
export function getJWKSStatus() {
  return {
    configured: !!config.jwks.uri,
    uri: config.jwks.uri,
    cacheDuration: config.jwks.cacheDuration,
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    algorithms: config.jwt.algorithms,
  };
}
