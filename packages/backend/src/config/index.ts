/**
 * Backend API Configuration
 * 環境変数とアプリケーション設定を管理
 */

import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// 環境変数を読み込み
loadEnv();

/**
 * 環境変数スキーマ定義
 */
const envSchema = z.object({
  // サーバー設定
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Cognito/JWKS 設定
  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_REGION: z.string().optional(),
  JWKS_URI: z.string().url().optional(),

  // CORS 設定
  CORS_ALLOWED_ORIGINS: z.string().default('*'),

  // JWT 設定
  JWT_ISSUER: z.string().optional(),
  JWT_AUDIENCE: z.string().optional(),
});

/**
 * 環境変数を検証してパース
 */
function parseEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('❌ 無効な環境変数設定:', error);
    process.exit(1);
  }
}

const env = parseEnv();

/**
 * アプリケーション設定
 */
export const config = {
  // サーバー設定
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',

  // JWKS 設定を構築
  jwks: {
    uri:
      env.JWKS_URI ||
      (env.COGNITO_USER_POOL_ID && env.COGNITO_REGION
        ? `https://cognito-idp.${env.COGNITO_REGION}.amazonaws.com/${env.COGNITO_USER_POOL_ID}/.well-known/jwks.json`
        : undefined),
    cacheDuration: 10 * 60 * 1000, // 10分間キャッシュ
  },

  // JWT 設定
  jwt: {
    issuer:
      env.JWT_ISSUER ||
      (env.COGNITO_USER_POOL_ID && env.COGNITO_REGION
        ? `https://cognito-idp.${env.COGNITO_REGION}.amazonaws.com/${env.COGNITO_USER_POOL_ID}`
        : undefined),
    audience: env.JWT_AUDIENCE,
    algorithms: ['RS256'] as const,
  },

  // CORS 設定
  cors: {
    allowedOrigins: env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()),
  },
} as const;

/**
 * 設定検証
 */
export function validateConfig() {
  const issues: string[] = [];

  if (!config.jwks.uri) {
    issues.push(
      'JWKS URI が設定されていません (JWKS_URI または COGNITO_USER_POOL_ID + COGNITO_REGION が必要)'
    );
  }

  if (!config.jwt.issuer) {
    issues.push(
      'JWT Issuer が設定されていません (JWT_ISSUER または COGNITO_USER_POOL_ID + COGNITO_REGION が必要)'
    );
  }

  if (issues.length > 0) {
    console.warn('⚠️  設定に問題があります:');
    issues.forEach((issue) => console.warn(`  - ${issue}`));

    if (config.isProduction) {
      console.error('❌ 本番環境では全ての設定が必要です');
      process.exit(1);
    } else {
      console.warn('🔧 開発環境では警告として継続します');
    }
  }
}

// 初期化時に設定を検証
validateConfig();

console.log('⚙️  Backend API 設定が読み込まれました:', {
  port: config.port,
  nodeEnv: config.nodeEnv,
  hasJwksUri: !!config.jwks.uri,
  hasJwtIssuer: !!config.jwt.issuer,
  corsOrigins: config.cors.allowedOrigins,
});
