/**
 * Lambda Context Parser
 */

import { Context } from 'aws-lambda';

/**
 * Extract tool name from Lambda function name
 * Example: "agentcore-image-generation-nova-canvas-generate-function" -> "nova-canvas-generate"
 */
export function extractToolName(context: Context): string | null {
  const functionName = context.functionName;
  
  // Extract tool name from function name pattern
  const match = functionName.match(/agentcore-image-generation-(.+)-function/);
  if (match && match[1]) {
    return match[1];
  }
  
  return null;
}

/**
 * Get context summary for logging
 */
export function getContextSummary(context: Context) {
  return {
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    memoryLimitInMB: context.memoryLimitInMB,
    awsRequestId: context.awsRequestId,
    logGroupName: context.logGroupName,
    logStreamName: context.logStreamName,
  };
}
