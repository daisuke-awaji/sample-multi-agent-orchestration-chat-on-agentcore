import { APIGatewayProxyResult, Context } from 'aws-lambda';
import { logger } from './logger.js';
import { extractToolName, getContextSummary } from './context-parser.js';
import { getToolHandler } from './tools/index.js';
import {
  createSuccessResponse,
  createErrorResponse,
  createOptionsResponse,
  extractResponseMetadata,
} from './response-builder.js';
import { ToolInput } from './types.js';

/**
 * AgentCore Gateway Image Generation Tool Lambda Handler
 *
 * This Lambda function is called from AgentCore Gateway to execute image generation tools.
 */
export async function handler(event: ToolInput, context: Context): Promise<APIGatewayProxyResult> {
  const reqId = context.awsRequestId;
  const timestamp = new Date().toISOString();

  // Set request ID for logger
  logger.setRequestId(reqId);

  // Start log: Record request information
  const contextSummary = getContextSummary(context);
  logger.info('START', {
    timestamp,
    eventKeys: Object.keys(event),
    eventSize: JSON.stringify(event).length,
    ...contextSummary,
  });

  try {
    // Extract tool name from context
    const toolName = extractToolName(context);

    // Get tool handler
    const toolHandler = getToolHandler(toolName);

    // Tool execution log
    logger.info('TOOL_EXEC', {
      tool: toolName || 'nova-canvas-generate',
      inputKeys: Object.keys(event),
      inputSize: JSON.stringify(event).length,
    });

    // Execute tool
    const toolInput: ToolInput = event;
    const toolResult = await toolHandler(toolInput);

    // Create success response
    const response = createSuccessResponse(toolResult, toolName, reqId, timestamp);

    // Success log
    const responseMetadata = extractResponseMetadata(response, toolResult);
    logger.info('SUCCESS', {
      tool: toolName || 'nova-canvas-generate',
      executionTime: context.getRemainingTimeInMillis(),
      ...responseMetadata,
    });

    return response;
  } catch (error) {
    // Error log
    logger.error('ERROR', {
      error,
      tool: extractToolName(context) || 'unknown',
      remainingTime: context.getRemainingTimeInMillis(),
    });

    // Create error response
    return createErrorResponse(error, extractToolName(context), reqId, timestamp);
  }
}

/**
 * OPTIONS request handler (for CORS)
 */
export async function optionsHandler(): Promise<APIGatewayProxyResult> {
  return createOptionsResponse();
}
