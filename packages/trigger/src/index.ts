/**
 * Lambda handler entry point for Trigger Lambda
 * Handles EventBridge Scheduler events and custom EventBridge events
 */

import { SchedulerEvent, CustomEventBridgeEvent } from './types/index.js';
import { handleSchedulerEvent } from './handlers/schedule-handler.js';
import { handleCustomEvent } from './handlers/custom-event-handler.js';

/**
 * Type guard to check if event is a SchedulerEvent
 */
function isSchedulerEvent(event: any): event is SchedulerEvent {
  return (
    event.source === 'aws.scheduler' ||
    event['detail-type'] === 'Scheduled Event' ||
    (event.detail && 'triggerId' in event.detail && 'userId' in event.detail)
  );
}

/**
 * Type guard to check if event is a CustomEventBridgeEvent
 */
function isCustomEvent(event: any): event is CustomEventBridgeEvent {
  return (
    event.source !== undefined &&
    event['detail-type'] !== undefined &&
    event.source !== 'aws.scheduler' &&
    event['detail-type'] !== 'Scheduled Event'
  );
}

/**
 * AWS Lambda handler
 * Routes to appropriate handler based on event type
 */
export const handler = async (event: SchedulerEvent | CustomEventBridgeEvent) => {
  console.log('Lambda invoked with event:', JSON.stringify(event, null, 2));

  try {
    // Route based on event type
    if (isSchedulerEvent(event)) {
      console.log('📅 Routing to Scheduler event handler');
      const response = await handleSchedulerEvent(event as SchedulerEvent);
      console.log('Handler response:', response);
      return response;
    } else if (isCustomEvent(event)) {
      console.log('🔔 Routing to Custom event handler');
      const response = await handleCustomEvent(event as CustomEventBridgeEvent);
      console.log('Handler response:', response);
      return response;
    } else {
      console.error('❌ Unknown event type:', event);
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Unknown event type',
          message: 'Event does not match any supported event type',
        }),
      };
    }
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
export * from './services/prompt-builder.js';
export * from './services/execution-recorder.js';
export * from './handlers/schedule-handler.js';
export * from './handlers/custom-event-handler.js';
