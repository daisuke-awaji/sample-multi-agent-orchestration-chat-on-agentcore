/**
 * Response Builder for Lambda
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { ToolResult } from './types.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

/**
 * Create success response
 */
export function createSuccessResponse(
  result: ToolResult,
  toolName: string | null,
  requestId: string,
  timestamp: string
): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify({
      success: true,
      tool: toolName || 'unknown',
      requestId,
      timestamp,
      result,
    }),
  };
}

/**
 * Create error response
 */
export function createErrorResponse(
  error: unknown,
  toolName: string | null,
  requestId: string,
  timestamp: string
): APIGatewayProxyResult {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorName = error instanceof Error ? error.constructor.name : 'UnknownError';

  return {
    statusCode: 500,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify({
      success: false,
      tool: toolName || 'unknown',
      requestId,
      timestamp,
      error: {
        name: errorName,
        message: errorMessage,
      },
    }),
  };
}

/**
 * Create OPTIONS response for CORS
 */
export function createOptionsResponse(): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: '',
  };
}

/**
 * Extract response metadata for logging
 */
export function extractResponseMetadata(response: APIGatewayProxyResult, result: ToolResult) {
  return {
    statusCode: response.statusCode,
    bodySize: response.body.length,
    resultKeys: Object.keys(result),
  };
}
