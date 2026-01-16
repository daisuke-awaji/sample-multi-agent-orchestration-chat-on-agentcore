/**
 * Lambda handler entry point for Trigger Lambda
 * Handles EventBridge Scheduler events to invoke Agent API
 */

import { SchedulerEvent } from './types/index.js';
import { handleSchedulerEvent } from './handlers/schedule-handler.js';

/**
 * AWS Lambda handler
 * This function is invoked by EventBridge Scheduler
 */
export const handler = async (event: SchedulerEvent) => {
  console.log('Lambda invoked with event:', JSON.stringify(event, null, 2));

  try {
    // Route to schedule handler
    // In the future, we can add routing logic here for different event types
    const response = await handleSchedulerEvent(event);

    console.log('Handler response:', response);
    return response;
  } catch (error) {
    console.error('Unhandled error in Lambda handler:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
};

// Export types and services for testing
export * from './types/index.js';
export * from './services/auth-service.js';
export * from './services/agent-invoker.js';
export * from './services/execution-recorder.js';
export * from './handlers/schedule-handler.js';
