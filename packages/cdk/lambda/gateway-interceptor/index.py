"""
AgentCore Gateway Request Interceptor
======================================

Intercepts tools/call requests and injects user context (_context) into
the request body arguments. The Gateway's CUSTOM_JWT authorizer has already
validated the token, so we only decode the payload (no signature verification).

Context injection format:
  arguments._context = { "userId": "<cognito:username or sub>", "storagePath": "/" }

Other MCP methods (tools/list, etc.) are passed through unchanged.
Existing Lambda tools that do not use _context are unaffected.
"""

import json
import logging
import os
import base64

LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()
logger = logging.getLogger()
logger.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))


def decode_jwt_payload(token: str) -> dict | None:
    """Decode JWT payload without signature verification.

    The Gateway has already validated the signature so we only need the claims.
    """
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
        payload = parts[1]
        # Add base64 padding
        payload += '=' * (4 - len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        return None


def extract_user_id(jwt_payload: dict) -> str | None:
    """Extract userId from JWT claims.

    Priority order matches the moca Agent middleware:
    1. cognito:username
    2. sub (if different from client_id)
    3. username
    """
    username = jwt_payload.get('cognito:username') or jwt_payload.get('username')
    if username:
        return username

    sub = jwt_payload.get('sub')
    client_id = jwt_payload.get('client_id')
    if sub and sub != client_id:
        return sub

    return None


def extract_jwt_from_headers(headers: dict) -> str | None:
    """Extract raw JWT token from Authorization header (case-insensitive)."""
    for name, value in headers.items():
        if name.lower() == 'authorization' and value.startswith('Bearer '):
            return value[7:]
    return None


def lambda_handler(event, context):
    """Gateway REQUEST interceptor.

    For tools/call: injects _context into arguments.
    For all other methods: passes through unchanged.
    """
    mcp_data = event.get('mcp', {})

    # RESPONSE interceptor path (should not be reached, but handle gracefully)
    if 'gatewayResponse' in mcp_data and mcp_data['gatewayResponse'] is not None:
        logger.info('RESPONSE interceptor pass-through')
        return {
            'interceptorOutputVersion': '1.0',
            'mcp': {
                'transformedGatewayResponse': {
                    'body': mcp_data.get('gatewayResponse', {}).get('body', {}),
                    'statusCode': mcp_data.get('gatewayResponse', {}).get('statusCode', 200),
                },
            },
        }

    # REQUEST interceptor path
    gateway_request = mcp_data.get('gatewayRequest', {})
    request_body = gateway_request.get('body', {})
    headers = gateway_request.get('headers', {})
    mcp_method = request_body.get('method', 'unknown')

    logger.info(f'REQUEST interceptor: method={mcp_method}')

    # Only inject context for tools/call
    if mcp_method == 'tools/call':
        jwt_token = extract_jwt_from_headers(headers)
        if jwt_token:
            jwt_payload = decode_jwt_payload(jwt_token)
            if jwt_payload:
                user_id = extract_user_id(jwt_payload)
                if user_id:
                    # Inject _context into arguments
                    params = request_body.get('params', {})
                    arguments = params.get('arguments', {})
                    arguments['_context'] = {
                        'userId': user_id,
                        'storagePath': '/',
                    }
                    params['arguments'] = arguments
                    request_body['params'] = params

                    logger.info(f'Injected _context for user={user_id}')
                else:
                    logger.warning('Could not extract userId from JWT')
            else:
                logger.warning('Failed to decode JWT payload')
        else:
            logger.warning('No Authorization header found')

    return {
        'interceptorOutputVersion': '1.0',
        'mcp': {
            'transformedGatewayRequest': {
                'body': request_body,
            },
        },
    }
