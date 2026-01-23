/**
 * JWT Authentication Middleware
 * Express middleware that executes JWT authentication
 */

import { Request, Response, NextFunction } from 'express';
import { verifyJWT, extractJWTFromHeader, CognitoJWTPayload } from '../utils/jwks.js';
import { config } from '../config/index.js';

/**
 * Authenticated request type definition
 * Add JWT information to Express Request object
 */
export interface AuthenticatedRequest extends Request {
  /** JWT payload */
  jwt?: CognitoJWTPayload;
  /** User ID */
  userId?: string;
  /** Request ID (for log tracking) */
  requestId?: string;
}

/**
 * Authentication error response type definition
 */
interface AuthErrorResponse {
  error: string;
  message: string;
  code: string;
  timestamp: string;
  requestId?: string;
}

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
    console.warn(`❌ Authorization header not set (${requestId})`);
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
    console.warn(`❌ Invalid Authorization header format (${requestId})`);
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

  // In production: JWKS verification, in development: branch based on configuration
  if (config.isProduction || config.jwks.uri) {
    // Execute JWKS verification
    verifyJWT(token)
      .then((result) => {
        if (!result.valid) {
          console.warn(`❌ JWT verification failed (${requestId}):`, result.error);
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
        console.error(`💥 JWT verification error (${requestId}):`, error);
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
    // In development environment with JWKS not configured: decode only (no verification)
    console.warn(
      `⚠️  Development environment: Skipping verification due to JWKS not configured (${requestId})`
    );

    try {
      // Base64 decode JWT (no verification)
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

      console.log(`🔧 JWT decode successful (no verification) (${requestId}):`, {
        hasUserId: !!req.userId,
        tokenUse: payload.token_use,
      });

      next();
    } catch (error) {
      console.error(`❌ JWT decode error (${requestId}):`, error);
      res
        .status(401)
        .json(createAuthErrorResponse('JWT_DECODE_ERROR', 'Failed to decode JWT', requestId));
      return;
    }
  }
}

/**
 * Optional authentication middleware
 * Verify only if JWT exists, pass through if it doesn't
 */
export function optionalJwtAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.get('Authorization');

  if (!authHeader) {
    // Pass through if authentication header doesn't exist
    return next();
  }

  // Execute normal authentication if authentication header exists
  return jwtAuthMiddleware(req, res, next);
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
 * Authentication information type definition
 */
export interface AuthInfo {
  authenticated: boolean;
  userId?: string;
  username?: string;
  email?: string;
  groups: string[];
  tokenUse?: 'access' | 'id';
  requestId?: string;
  /** Whether the token is from a machine user (Client Credentials Flow) */
  isMachineUser: boolean;
  /** Client ID (for machine users) */
  clientId?: string;
  /** OAuth scopes (for machine users) */
  scopes?: string[];
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
