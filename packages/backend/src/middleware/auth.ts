/**
 * JWT Authentication Middleware
 * Express middleware that executes JWT authentication
 */

import { Response, NextFunction } from 'express';
import { verifyJWT, extractJWTFromHeader } from '../libs/auth/index.js';
import type {
  CognitoJWTPayload,
  AuthenticatedRequest,
  AuthInfo,
  AuthErrorResponse,
} from '../types/index.js';

// Re-export types for backward compatibility
export type { AuthenticatedRequest, AuthInfo } from '../types/index.js';

/**
 * Generate request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate authentication error response
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
 * JWT authentication middleware
 * Verify JWT in Authorization header and add authentication information to request
 */
export function jwtAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const requestId = generateRequestId();
  req.requestId = requestId;

  // Get Authorization header
  const authHeader = req.get('Authorization');

  if (!authHeader) {
    console.warn('❌ Authorization header not set (%s)', requestId);
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

  // Extract JWT token
  const token = extractJWTFromHeader(authHeader);

  if (!token) {
    console.warn('❌ Invalid Authorization header format (%s)', requestId);
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

  // Verify JWT via aws-jwt-verify (always enforced)
  verifyJWT(token)
    .then((result) => {
      if (!result.valid) {
        console.warn('❌ JWT verification failed (%s):', requestId, result.error);
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

      // Verification successful: Add authentication information to request
      req.jwt = result.payload;
      req.userId = result.payload?.sub || result.payload?.['cognito:username'];

      next();
    })
    .catch((error) => {
      console.error('💥 JWT verification error (%s):', requestId, error);
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
}

/**
 * Determine if the JWT token is from a machine user (Client Credentials Flow)
 *
 * Client Credentials Flow characteristics:
 * 1. No username or cognito:username claim
 * 2. sub claim is either missing or equals client_id
 * 3. token_use is 'access'
 *
 * Regular user tokens (Authorization Code Flow):
 * - Have cognito:username or username claim
 * - sub claim contains user UUID (different from client_id)
 * - Can be either 'access' or 'id' token_use
 */
function isMachineUserToken(payload?: CognitoJWTPayload): boolean {
  if (!payload) return false;

  // Check for user identifier claims
  const hasUserIdentifier = payload['cognito:username'] || payload['username'];

  // Check if sub exists and is different from client_id
  // For regular users: sub is a UUID different from client_id
  // For machine users: sub is either missing or equals client_id
  const hasUserSub = payload.sub && payload.sub !== payload.client_id;

  // If has user identifier or valid user sub, it's a regular user
  if (hasUserIdentifier || hasUserSub) {
    return false;
  }

  // Machine user: no user identifiers and token_use is 'access'
  return payload.token_use === 'access';
}

/**
 * Helper function to get current authentication information
 */
export function getCurrentAuth(req: AuthenticatedRequest): AuthInfo {
  const payload = req.jwt;
  const machineUser = isMachineUserToken(payload);

  return {
    authenticated: !!payload,
    userId: machineUser ? undefined : req.userId,
    username: payload?.['cognito:username'] || payload?.username,
    email: payload?.email,
    groups: payload?.['cognito:groups'] || [],
    tokenUse: payload?.token_use,
    requestId: req.requestId,
    isMachineUser: machineUser,
    clientId: machineUser ? payload?.client_id : undefined,
    scopes: payload?.scope?.split(' '),
  };
}
