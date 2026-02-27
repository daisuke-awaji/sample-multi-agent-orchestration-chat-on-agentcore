/**
 * Cognito Authentication
 * JWT authentication using Amazon Cognito
 */

import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';
import type { CognitoConfig } from '../config/index.js';

export interface AuthResult {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn: number;
}

/**
 * JWT token payload type
 */
export interface TokenPayload {
  sub: string;
  username?: string;
  'cognito:username'?: string;
  exp: string;
  iat: string;
  iss: string;
  aud: string;
}

/**
 * Get JWT token from Cognito
 */
export async function getJwtToken(config: CognitoConfig): Promise<AuthResult> {
  const client = new CognitoIdentityProviderClient({
    region: config.region,
  });

  try {
    const command = new InitiateAuthCommand({
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      ClientId: config.clientId,
      AuthParameters: {
        USERNAME: config.username,
        PASSWORD: config.password,
      },
    });

    const response = await client.send(command);

    if (!response.AuthenticationResult?.AccessToken) {
      throw new Error('JWT トークンの取得に失敗しました');
    }

    return {
      accessToken: response.AuthenticationResult.AccessToken,
      idToken: response.AuthenticationResult.IdToken,
      refreshToken: response.AuthenticationResult.RefreshToken,
      expiresIn: response.AuthenticationResult.ExpiresIn || 3600,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Cognito 認証エラー: ${error.message}`);
    }
    throw new Error('不明な認証エラーが発生しました');
  }
}

/**
 * Check JWT token expiration
 */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const exp = payload.exp;
    const now = Math.floor(Date.now() / 1000);
    return exp < now;
  } catch {
    return true;
  }
}

/**
 * Get JWT token information
 */
export function getTokenInfo(token: string): TokenPayload | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return {
      sub: payload.sub,
      username: payload.username || payload['cognito:username'],
      exp: new Date(payload.exp * 1000).toISOString(),
      iat: new Date(payload.iat * 1000).toISOString(),
      iss: payload.iss,
      aud: payload.aud,
    };
  } catch {
    return null;
  }
}

/**
 * Token cache management
 */
class TokenCache {
  private cache: Map<string, { token: AuthResult; timestamp: number }> = new Map();

  set(key: string, token: AuthResult): void {
    this.cache.set(key, {
      token,
      timestamp: Date.now(),
    });
  }

  get(key: string): AuthResult | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    // Check token expiration
    const expiresAt = cached.timestamp + cached.token.expiresIn * 1000;
    const bufferTime = 300 * 1000; // 5-minute buffer

    if (Date.now() + bufferTime > expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached.token;
  }

  clear(): void {
    this.cache.clear();
  }
}

export const tokenCache = new TokenCache();

/**
 * Get token with caching
 */
export async function getCachedJwtToken(config: CognitoConfig): Promise<AuthResult> {
  const cacheKey = `${config.userPoolId}:${config.username}`;

  // Try to retrieve from cache
  const cached = tokenCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch new token
  const token = await getJwtToken(config);
  tokenCache.set(cacheKey, token);

  return token;
}
