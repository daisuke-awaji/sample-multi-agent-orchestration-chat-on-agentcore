/**
 * Authentication and User ID Resolution
 * Handles machine user verification and effective user ID resolution
 */

import { logger } from '../config/index.js';
import { getCurrentContext } from '../context/request-context.js';

/**
 * Required OAuth scope for machine user invocation
 */
export const REQUIRED_MACHINE_USER_SCOPE = 'agent/invoke';

/**
 * Validate OAuth scopes for machine user
 * @param scopes - Array of OAuth scopes from the token
 * @returns Validation result with error if scopes are insufficient
 */
export function validateMachineUserScopes(scopes?: string[]): {
  valid: boolean;
  error?: { status: number; message: string };
} {
  if (!scopes || scopes.length === 0) {
    return {
      valid: false,
      error: {
        status: 403,
        message: `Insufficient scope: '${REQUIRED_MACHINE_USER_SCOPE}' scope is required for machine user invocation`,
      },
    };
  }

  if (!scopes.includes(REQUIRED_MACHINE_USER_SCOPE)) {
    return {
      valid: false,
      error: {
        status: 403,
        message: `Insufficient scope: '${REQUIRED_MACHINE_USER_SCOPE}' scope is required, but only [${scopes.join(', ')}] provided`,
      },
    };
  }

  return { valid: true };
}

/**
 * Validate targetUserId format
 * - Must be non-empty
 * - Must be a valid UUID format (Cognito sub)
 * @param targetUserId - Target user ID to validate (must be Cognito sub UUID)
 * @returns Validation result with error if invalid
 */
export function validateTargetUserId(targetUserId: string): {
  valid: boolean;
  error?: { status: number; message: string };
} {
  // Check for empty or whitespace-only
  if (!targetUserId.trim()) {
    return {
      valid: false,
      error: {
        status: 400,
        message: 'targetUserId cannot be empty or whitespace',
      },
    };
  }

  // UUID format validation (Cognito sub is always a UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(targetUserId)) {
    return {
      valid: false,
      error: {
        status: 400,
        message: 'targetUserId must be a valid UUID format (Cognito sub)',
      },
    };
  }

  return { valid: true };
}

/**
 * JWT verification result for machine user claim
 */
export interface MachineUserVerificationResult {
  /** Whether the verification was successful (JWT was parseable) */
  verified: boolean;
  /** Whether the token represents a machine user */
  isMachineUser: boolean;
  /** Client ID from the token (for machine users) */
  clientId?: string;
  /** OAuth scopes from the token */
  scopes?: string[];
  /** Error details if verification failed */
  error?: { status: number; message: string };
}

/**
 * Independently verify machine user claim from JWT
 * This re-validates the JWT to prevent context poisoning attacks
 *
 * Security rationale:
 * - The handler must not blindly trust the isMachineUser flag from context
 * - This function re-parses the JWT to verify sub === client_id
 * - Prevents context poisoning attacks that could bypass OAuth scope validation
 *
 * @param authHeader - Authorization header value (Bearer token)
 * @returns Verification result with machine user status
 */
export function verifyMachineUserClaim(authHeader?: string): MachineUserVerificationResult {
  // No auth header - cannot be a valid machine user
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      verified: false,
      isMachineUser: false,
      error: {
        status: 401,
        message: 'Authorization header is required for machine user verification',
      },
    };
  }

  try {
    const token = authHeader.substring(7); // Remove 'Bearer '
    const parts = token.split('.');
    if (parts.length !== 3) {
      return {
        verified: false,
        isMachineUser: false,
        error: {
          status: 401,
          message: 'Invalid JWT format',
        },
      };
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

    // Extract claims for verification
    const sub = payload['sub'];
    const clientId = payload['client_id'];
    const tokenUse = payload['token_use'];
    const scopes = payload['scope']?.split(' ');

    // Check for user identifier claims (regular user indicators)
    const hasUserIdentifier = payload['cognito:username'] || payload['username'];

    // Machine user verification:
    // 1. token_use must be 'access'
    // 2. No user identifier claims (cognito:username, username)
    // 3. sub must equal client_id (or sub is missing)
    const isSubMachineUser = !sub || sub === clientId;
    const isMachineUser = !hasUserIdentifier && isSubMachineUser && tokenUse === 'access';

    return {
      verified: true,
      isMachineUser,
      clientId: isMachineUser ? clientId : undefined,
      scopes: isMachineUser ? scopes : undefined,
    };
  } catch (error) {
    logger.warn('JWT verification failed:', { error });
    return {
      verified: false,
      isMachineUser: false,
      error: {
        status: 401,
        message: 'JWT verification failed',
      },
    };
  }
}

/**
 * Resolve effective user ID based on authentication type
 * - Machine user (Client Credentials Flow): Use targetUserId from request body
 * - Regular user: Use userId from JWT
 *
 * Security: This function independently verifies machine user claims from JWT
 * to prevent context poisoning attacks that could bypass OAuth scope validation.
 */
export function resolveEffectiveUserId(
  context: ReturnType<typeof getCurrentContext>,
  targetUserId?: string
): { userId: string; error?: { status: number; message: string } } {
  const contextIsMachineUser = context?.isMachineUser ?? false;

  // Security: Independently verify machine user claim from JWT
  // This prevents context poisoning attacks
  if (contextIsMachineUser) {
    const verification = verifyMachineUserClaim(context?.authorizationHeader);

    // Check for JWT verification errors
    if (!verification.verified) {
      logger.warn('JWT verification failed for claimed machine user:', {
        requestId: context?.requestId,
        error: verification.error?.message,
      });
      return {
        userId: '',
        error: verification.error || {
          status: 401,
          message: 'Authentication verification failed',
        },
      };
    }

    // Cross-check: context claims machine user but JWT verification disagrees
    if (!verification.isMachineUser) {
      logger.warn(
        'Context poisoning attempt detected: context isMachineUser=true but JWT verification failed',
        {
          requestId: context?.requestId,
          contextClientId: context?.clientId,
          jwtClientId: verification.clientId,
        }
      );
      return {
        userId: '',
        error: {
          status: 403,
          message: 'Authentication verification failed: machine user claim could not be verified',
        },
      };
    }

    // Use scopes from JWT verification (more trustworthy than context)
    const verifiedScopes = verification.scopes;

    // Machine user: Validate OAuth scopes using verified scopes
    const scopeValidation = validateMachineUserScopes(verifiedScopes);
    if (!scopeValidation.valid && scopeValidation.error) {
      return {
        userId: '',
        error: scopeValidation.error,
      };
    }

    // Machine user: targetUserId is required
    if (!targetUserId) {
      return {
        userId: '',
        error: {
          status: 400,
          message: 'targetUserId is required for machine user (Client Credentials Flow)',
        },
      };
    }

    // Validate targetUserId format
    const targetUserIdValidation = validateTargetUserId(targetUserId);
    if (!targetUserIdValidation.valid && targetUserIdValidation.error) {
      return {
        userId: '',
        error: targetUserIdValidation.error,
      };
    }

    logger.info('Machine user authentication verified:', {
      clientId: verification.clientId,
      targetUserId,
      scopes: verifiedScopes,
      requestId: context?.requestId,
    });
    return { userId: targetUserId };
  }

  // Regular user: targetUserId is not allowed
  if (targetUserId) {
    return {
      userId: '',
      error: {
        status: 403,
        message: 'targetUserId is not allowed for regular users',
      },
    };
  }

  return { userId: context?.userId || 'anonymous' };
}
