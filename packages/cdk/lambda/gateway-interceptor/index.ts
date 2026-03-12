/**
 * AgentCore Gateway Request Interceptor
 *
 * Intercepts tools/call requests and injects user context (_context) into
 * the request body arguments. The Gateway's CUSTOM_JWT authorizer has already
 * validated the token, so we only decode the payload (no signature verification).
 *
 * Context injection format:
 *   arguments._context = { "userId": "<sub claim>", "storagePath": "/" }
 *
 * The `sub` claim (UUID) is used as the user identifier for S3 storage paths,
 * since `cognito:username` may contain characters unsuitable for S3 keys
 * (e.g. email addresses with special characters).
 *
 * Other MCP methods (tools/list, etc.) are passed through unchanged.
 * Existing Lambda tools that do not use _context are unaffected.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

interface InterceptorEvent {
  mcp?: {
    gatewayRequest?: {
      headers?: Record<string, string>;
      body?: any;
    };
    gatewayResponse?: {
      body?: any;
      statusCode?: number;
    };
  };
}

interface InterceptorResponse {
  interceptorOutputVersion: '1.0';
  mcp: {
    transformedGatewayRequest?: {
      headers?: Record<string, string>;
      body?: any;
    };
    transformedGatewayResponse?: {
      body?: any;
      statusCode?: number;
    };
  };
}

interface JwtPayload {
  sub?: string;
  client_id?: string;
  'cognito:username'?: string;
  username?: string;
  [key: string]: unknown;
}

/**
 * Decode JWT payload without signature verification.
 * The Gateway has already validated the signature so we only need the claims.
 */
function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let payload = parts[1];
    // Add base64url padding
    payload += '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Extract the `sub` claim from JWT for use as user identifier.
 *
 * The `sub` claim (UUID) is used because:
 * - It is guaranteed to be unique and immutable in Cognito
 * - It is safe for S3 key paths (no special characters)
 * - `cognito:username` may be an email address with characters
 *   that complicate S3 paths
 *
 * For machine users (Client Credentials Flow), `sub` equals `client_id`
 * and there is no human user — we still return it for consistency.
 */
function extractUserId(jwtPayload: JwtPayload): string | null {
  const sub = jwtPayload.sub;
  if (sub) return sub;
  return null;
}

/**
 * Extract storage path from x-storage-path header (case-insensitive).
 * Falls back to '/' if the header is missing or empty.
 */
function extractStoragePath(headers: Record<string, string>): string {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === 'x-storage-path' && value) {
      return value;
    }
  }
  return '/';
}

/**
 * Extract raw JWT token from Authorization header (case-insensitive).
 */
function extractJwtFromHeaders(headers: Record<string, string>): string | null {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === 'authorization' && value.startsWith('Bearer ')) {
      return value.slice(7);
    }
  }
  return null;
}

/**
 * Lambda handler for Gateway REQUEST interceptor.
 *
 * For tools/call: injects _context into arguments.
 * For all other methods: passes through unchanged.
 */
export const handler = async (event: InterceptorEvent): Promise<InterceptorResponse> => {
  const mcpData = event.mcp ?? {};

  // RESPONSE interceptor path (should not be reached, but handle gracefully)
  if (mcpData.gatewayResponse != null) {
    console.info('RESPONSE interceptor pass-through');
    return {
      interceptorOutputVersion: '1.0',
      mcp: {
        transformedGatewayResponse: {
          body: mcpData.gatewayResponse.body ?? {},
          statusCode: mcpData.gatewayResponse.statusCode ?? 200,
        },
      },
    };
  }

  // REQUEST interceptor path
  const gatewayRequest = mcpData.gatewayRequest ?? {};
  const requestBody = gatewayRequest.body ?? {};
  const headers = gatewayRequest.headers ?? {};
  const mcpMethod: string = requestBody.method ?? 'unknown';

  console.info(`REQUEST interceptor: method=${mcpMethod}`);

  // Only inject context for tools/call
  if (mcpMethod === 'tools/call') {
    const jwtToken = extractJwtFromHeaders(headers);
    if (jwtToken) {
      const jwtPayload = decodeJwtPayload(jwtToken);
      if (jwtPayload) {
        const userId = extractUserId(jwtPayload);
        if (userId) {
          const params = requestBody.params ?? {};
          const args = params.arguments ?? {};
          args._context = {
            userId,
            storagePath: extractStoragePath(headers),
          };
          params.arguments = args;
          requestBody.params = params;
          console.info(`Injected _context for user=${userId}`);
        } else {
          console.warn('Could not extract sub claim from JWT');
        }
      } else {
        console.warn('Failed to decode JWT payload');
      }
    } else {
      console.warn('No Authorization header found');
    }
  }

  return {
    interceptorOutputVersion: '1.0',
    mcp: {
      transformedGatewayRequest: {
        body: requestBody,
      },
    },
  };
};
