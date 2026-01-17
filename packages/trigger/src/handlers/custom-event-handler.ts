/**
 * Custom Event Handler
 * Handles EventBridge custom events (S3, GitHub, Slack, etc.) using event subscription model
 */

import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { CustomEventBridgeEvent, EventDrivenContext, Trigger } from '../types/index.js';
import { AuthService } from '../services/auth-service.js';
import { AgentInvoker } from '../services/agent-invoker.js';
import { ExecutionRecorder } from '../services/execution-recorder.js';
import { createAgentsService } from '../services/agents-service.js';

const dynamoClient = new DynamoDBClient({});

/**
 * Resolve eventSourceId from EventBridge event
 * The eventSourceId is injected by EventBridge Rule's InputTransformer
 */
function resolveEventSourceId(event: CustomEventBridgeEvent): string {
  // InputTransformer injects _eventSourceId from environments.ts eventRules config
  const injectedId = (event as unknown as { _eventSourceId?: string })._eventSourceId;

  if (injectedId) {
    console.log(`✅ eventSourceId resolved from InputTransformer: ${injectedId}`);
    return injectedId;
  }

  // Fallback for direct invocations (testing, manual triggers, etc.)
  const source = event.source;
  console.warn(`⚠️ eventSourceId not found in event. Using source as fallback: ${source}`);
  return source.replace(/\./g, '-');
}

/**
 * Find all triggers subscribed to the given eventSourceId (GSI2 query)
 */
async function findSubscribedTriggers(eventSourceId: string): Promise<Trigger[]> {
  const tableName = process.env.TRIGGERS_TABLE_NAME;
  if (!tableName) {
    throw new Error('TRIGGERS_TABLE_NAME environment variable not configured');
  }

  console.log(`🔍 Querying GSI2 for eventSourceId: ${eventSourceId}`);

  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      FilterExpression: '#enabled = :enabled',
      ExpressionAttributeNames: {
        '#enabled': 'enabled',
      },
      ExpressionAttributeValues: {
        ':pk': { S: `EVENTSOURCE#${eventSourceId}` },
        ':enabled': { BOOL: true },
      },
    })
  );

  if (!result.Items || result.Items.length === 0) {
    console.log(`No enabled triggers found for eventSourceId: ${eventSourceId}`);
    return [];
  }

  const triggers = result.Items.map((item) => unmarshall(item) as Trigger);
  console.log(`✅ Found ${triggers.length} subscribed trigger(s)`);
  return triggers;
}

/**
 * Invoke a single trigger with the event data
 */
async function invokeTrigger(
  trigger: Trigger,
  event: CustomEventBridgeEvent,
  authService: AuthService,
  agentInvoker: AgentInvoker,
  executionRecorder: ExecutionRecorder
): Promise<{ success: boolean; error?: string }> {
  let executionId: string;

  try {
    console.log(`🚀 Invoking trigger: ${trigger.name} (${trigger.id})`);

    // Start execution record
    executionId = await executionRecorder.startExecution(trigger.id, trigger.userId);

    // Get authentication token
    const tokenResponse = await authService.getMachineUserToken();

    // Build EventDrivenContext
    const context: EventDrivenContext = {
      triggerId: trigger.id,
      triggerName: trigger.name,
      executionTime: new Date().toISOString(),
      eventBridge: {
        id: event.id,
        source: event.source,
        detailType: event['detail-type'],
        account: event.account,
        region: event.region,
        time: event.time,
        resources: event.resources,
      },
      eventDetail: event.detail,
    };

    // Build payload for agent invocation
    const payload = {
      triggerId: trigger.id,
      userId: trigger.userId,
      agentId: trigger.agentId,
      prompt: trigger.prompt,
      sessionId: trigger.sessionId,
      modelId: trigger.modelId,
      workingDirectory: trigger.workingDirectory,
      enabledTools: trigger.enabledTools,
    };

    // Invoke agent
    const result = await agentInvoker.invoke(payload, tokenResponse.accessToken, context);

    if (!result.success) {
      // Record failure
      await executionRecorder.failExecution(
        trigger.id,
        executionId,
        result.error || 'Unknown error'
      );
      return { success: false, error: result.error };
    }

    // Record execution completion
    await executionRecorder.completeExecution(
      trigger.id,
      executionId,
      result.requestId,
      result.sessionId
    );

    // Update trigger's last execution timestamp
    await executionRecorder.updateTriggerLastExecution(trigger.userId, trigger.id);

    console.log(`✅ Trigger invocation completed: ${trigger.name}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Trigger invocation failed: ${trigger.name}`, error);

    // Record failure if executionId was created
    try {
      if (executionId!) {
        await executionRecorder.failExecution(trigger.id, executionId, errorMessage);
      }
    } catch (recordError) {
      console.error('Failed to record execution failure:', recordError);
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Main custom event handler
 */
export async function handleCustomEvent(event: CustomEventBridgeEvent) {
  console.log('📥 Custom event received:', JSON.stringify(event, null, 2));

  // Initialize services
  let authService: AuthService;
  let agentInvoker: AgentInvoker;
  let executionRecorder: ExecutionRecorder;

  try {
    authService = AuthService.fromEnvironment();
    const agentsService = createAgentsService();
    agentInvoker = AgentInvoker.fromEnvironment(agentsService);
    executionRecorder = ExecutionRecorder.fromEnvironment();
  } catch (error) {
    console.error('Failed to initialize services:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Service initialization failed',
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }

  try {
    // 1. Resolve eventSourceId from event
    const eventSourceId = resolveEventSourceId(event);
    console.log(`🎯 Resolved eventSourceId: ${eventSourceId}`);

    // 2. Find all subscribed triggers (GSI2 query)
    const triggers = await findSubscribedTriggers(eventSourceId);

    if (triggers.length === 0) {
      console.log(`⚠️ No subscribed triggers found for eventSourceId: ${eventSourceId}`);
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'No triggers subscribed to this event source',
          eventSourceId,
          eventSource: event.source,
          eventDetailType: event['detail-type'],
        }),
      };
    }

    // 3. Invoke all subscribed triggers
    console.log(`🔄 Invoking ${triggers.length} trigger(s)...`);
    const results = await Promise.allSettled(
      triggers.map((trigger) =>
        invokeTrigger(trigger, event, authService, agentInvoker, executionRecorder)
      )
    );

    // 4. Summarize results
    const summary = {
      total: triggers.length,
      successful: results.filter((r) => r.status === 'fulfilled' && r.value.success).length,
      failed: results.filter(
        (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)
      ).length,
    };

    console.log('📊 Execution summary:', summary);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Event processed successfully',
        eventSourceId,
        eventSource: event.source,
        eventDetailType: event['detail-type'],
        summary,
      }),
    };
  } catch (error) {
    console.error('💥 Custom event handler error:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}
