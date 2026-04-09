/**
 * JWT verification utility using aws-jwt-verify
 * Verify JWT tokens issued by Cognito User Pool
 *
 * @see https://github.com/awslabs/aws-jwt-verify
 * @see https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html
 */

import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { CognitoJWTPayload, JWTVerificationResult } from '../../types/index.js';
import { config } from '../../config/index.js';

/**
 * Cached CognitoJwtVerifier instance
 */

let verifierInstance: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

/**
 * Get or create CognitoJwtVerifier instance (lazy initialization)
 *
 * tokenUse is set to null to accept both 'access' and 'id' tokens,
 * supporting both regular users and machine users (Client Credentials Flow).
 */
function getVerifier() {
  if (!verifierInstance) {
    if (!config.cognito.userPoolId) {
      throw new Error('Cognito User Pool ID is not configured (COGNITO_USER_POOL_ID required)');
    }

    console.log(`🔑 Initializing CognitoJwtVerifier for User Pool: ${config.cognito.userPoolId}`);

    verifierInstance = CognitoJwtVerifier.create({
      userPoolId: config.cognito.userPoolId,
      tokenUse: null, // Accept both 'access' and 'id' tokens
      clientId: config.cognito.clientId ?? null,
    });
  }

  return verifierInstance;
}

/**
 * Pre-load JWKS cache (call at server startup for faster first verification)
 */
export async function hydrateJWKS(): Promise<void> {
  try {
    const verifier = getVerifier();
    await verifier.hydrate();
    console.log('🔑 JWKS cache pre-loaded successfully');
  } catch (error) {
    console.warn('⚠️  Failed to pre-load JWKS cache:', error);
  }
}

/**
 * Verify JWT token
 * @param token JWT token (without Bearer prefix)
 * @returns Verification result
 */
export async function verifyJWT(token: string): Promise<JWTVerificationResult> {
  try {
    const verifier = getVerifier();
    const payload = await verifier.verify(token);

    return {
      valid: true,
      payload: payload as CognitoJWTPayload,
    };
  } catch (error) {
    console.warn('❌ JWT verification failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
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
    console.warn('⚠️  Authorization header is not in Bearer format');
    return null;
  }

  // Extract JWT token part
  return authHeader.substring(bearerPrefix.length).trim();
}
