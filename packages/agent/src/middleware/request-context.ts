/**
 * Request Context Middleware
 * Express middleware that sets request context
 */

import { Request, Response, NextFunction } from 'express';
import { createRequestContext, runWithContext } from '../context/request-context.js';
import { logger } from '../config/index.js';

/**
 * Token information extracted from JWT
 */
export interface TokenInfo {
  /** Whether the token is from a machine user (Client Credentials Flow) */
  isMachineUser: boolean;
  /** User ID (for regular users) */
  userId?: string;
  /** Client ID (for machine users) */
  clientId?: string;
  /** OAuth scopes */
  scopes?: string[];
}

/**
 * Parse JWT token and extract authentication information
 * Distinguishes between regular users (Authorization Code Flow) and machine users (Client Credentials Flow)
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
export function parseJWTToken(authHeader?: string): TokenInfo {
  if (!authHeader?.startsWith('Bearer ')) {
    return { isMachineUser: false };
  }

  try {
    const token = authHeader.substring(7); // Remove 'Bearer '
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

    // Check for user identifier claims
    const hasUserIdentifier = payload['cognito:username'] || payload['username'];

    // Check if sub exists and is different from client_id
    // For regular users: sub is a UUID different from client_id
    // For machine users: sub is either missing or equals client_id
    const hasUserSub = payload['sub'] && payload['sub'] !== payload['client_id'];

    // If has user identifier or valid user sub, it's a regular user
    const isMachineUser = !hasUserIdentifier && !hasUserSub && payload['token_use'] === 'access';

    if (isMachineUser) {
      return {
        isMachineUser: true,
        clientId: payload['client_id'],
        scopes: payload['scope']?.split(' '),
      };
    }

    // Regular user (Authorization Code Flow)
    return {
      isMachineUser: false,
      userId:
        payload['cognito:username'] ||
        payload['sub'] ||
        payload['userId'] ||
        payload['user_id'] ||
        payload['username'],
    };
  } catch (error) {
    logger.warn('JWT parsing failed:', { error });
    return { isMachineUser: false };
  }
}

/**
 * Middleware to set request context
 * Extract Authorization header and set context with AsyncLocalStorage
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Get Authorization header from multiple sources
  const authHeader =
    req.headers.authorization ||
    (req.headers['x-amzn-bedrock-agentcore-runtime-custom-authorization'] as string);

  // Parse JWT token to get authentication info
  const tokenInfo = parseJWTToken(authHeader);

  // Create request context
  const requestContext = createRequestContext(authHeader);

  // Set user info from token
  if (tokenInfo.userId) {
    requestContext.userId = tokenInfo.userId;
  }

  // Set machine user info
  requestContext.isMachineUser = tokenInfo.isMachineUser;
  requestContext.clientId = tokenInfo.clientId;
  requestContext.scopes = tokenInfo.scopes;

  // Log request context
  logger.info('📝 Request context middleware activated:', {
    requestId: requestContext.requestId,
    userId: requestContext.userId,
    isMachineUser: requestContext.isMachineUser,
    clientId: requestContext.clientId,
    hasAuth: !!authHeader,
    authType: authHeader?.split(' ')[0] || 'None',
    path: req.path,
    method: req.method,
  });

  // Set context with AsyncLocalStorage and execute next()
  runWithContext(requestContext, () => {
    next();
  });
}
