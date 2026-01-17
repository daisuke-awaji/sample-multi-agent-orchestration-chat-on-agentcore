/**
 * JWKS (JSON Web Key Set) verification utility
 * Verify JWT by retrieving public key from Cognito User Pool JWKS endpoint
 */

import { jwtVerify, createRemoteJWKSet, JWTPayload, JWTVerifyResult } from 'jose';
import { config } from '../config/index.js';

/**
 * JWT payload type definition
 */
export interface CognitoJWTPayload extends JWTPayload {
  /** Cognito Username */
  'cognito:username'?: string;
  /** Username (Access Token) */
  username?: string;
  /** Email */
  email?: string;
  /** Token Use (access or id) */
  token_use?: 'access' | 'id';
  /** Client ID */
  client_id?: string;
  /** OAuth Scopes (space-separated, for machine users) */
  scope?: string;
  /** Cognito Groups */
  'cognito:groups'?: string[];
  /** Auth Time */
  auth_time?: number;
}

/**
 * JWT verification result type definition
 */
export interface JWTVerificationResult {
  /** Verification success flag */
  valid: boolean;
  /** Decoded payload */
  payload?: CognitoJWTPayload;
  /** Error message */
  error?: string;
  /** Error details */
  details?: unknown;
}

/**
 * Cache JWKS instance
 */
let jwksInstance: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Get JWKS instance (lazy initialization)
 */
function getJWKS(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksInstance) {
    if (!config.jwks.uri) {
      throw new Error('JWKS URI is not configured');
    }

    console.log(`🔑 Initializing JWKS endpoint: ${config.jwks.uri}`);
    jwksInstance = createRemoteJWKSet(new URL(config.jwks.uri), {
      cacheMaxAge: config.jwks.cacheDuration,
    });
  }

  return jwksInstance;
}

/**
 * Verify JWT token
 * @param token JWT token (without Bearer prefix)
 * @returns Verification result
 */
export async function verifyJWT(token: string): Promise<JWTVerificationResult> {
  try {
    // Get JWKS instance
    const JWKS = getJWKS();

    // Verify JWT
    const verifyOptions: {
      issuer?: string;
      audience?: string;
      algorithms: string[];
    } = {
      algorithms: ['RS256'],
    };

    // Add issuer only if configured
    if (config.jwt.issuer) {
      verifyOptions.issuer = config.jwt.issuer;
    }

    // Add audience only if configured
    if (config.jwt.audience) {
      verifyOptions.audience = config.jwt.audience;
    }

    const { payload }: JWTVerifyResult = await jwtVerify(token, JWKS, verifyOptions);

    return {
      valid: true,
      payload: payload as CognitoJWTPayload,
    };
  } catch (error) {
    console.warn('❌ JWT verification failed:', {
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
 * Extract JWT token from Authorization header
 * @param authHeader Authorization header
 * @returns JWT token (without Bearer prefix)
 */
export function extractJWTFromHeader(authHeader: string): string | null {
  if (!authHeader) {
    return null;
  }

  // Check for "Bearer " prefix
  const bearerPrefix = 'Bearer ';
  if (!authHeader.startsWith(bearerPrefix)) {
    console.warn('⚠️  Authorization header is not in Bearer format:', authHeader.substring(0, 20));
    return null;
  }

  // Extract JWT token part
  return authHeader.substring(bearerPrefix.length).trim();
}

/**
 * Decode JWT (without verification)
 * For development and debugging purposes
 * @param token JWT token
 * @returns Decode result
 */
export function decodeJWTUnsafe(token: string): {
  payload: CognitoJWTPayload | null;
  error?: string;
} {
  try {
    // JWT consists of 3 parts (header.payload.signature)
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { payload: null, error: 'Invalid JWT format' };
    }

    // Base64URL decode
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
 * Check JWKS configuration status
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
