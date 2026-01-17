/**
 * Triggers DynamoDB Service
 * Manages trigger configurations in DynamoDB
 */

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { nanoid } from 'nanoid';

/**
 * Trigger type definitions (matching trigger package)
 */
export type TriggerType = 'schedule' | 'event';

export interface ScheduleTriggerConfig {
  expression: string;
  timezone?: string;
  schedulerArn?: string;
  scheduleGroupName?: string;
}

export interface EventTriggerConfig {
  eventSourceId?: string;
  eventBusName?: string;
  eventPattern?: Record<string, unknown>;
  ruleArn?: string;
}

export interface Trigger {
  PK: string;
  SK: string;
  id: string;
  userId: string;
  name: string;
  description?: string;
  type: TriggerType;
  enabled: boolean;
  agentId: string;
  prompt: string;
  sessionId?: string;
  modelId?: string;
  workingDirectory?: string;
  enabledTools?: string[];
  scheduleConfig?: ScheduleTriggerConfig;
  eventConfig?: EventTriggerConfig;
  createdAt: string;
  updatedAt: string;
  lastExecutedAt?: string;
  GSI1PK?: string;
  GSI1SK?: string;
  GSI2PK?: string;
  GSI2SK?: string;
}

export interface TriggerExecution {
  PK: string;
  SK: string;
  triggerId: string;
  executionId: string;
  userId: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed';
  requestId?: string;
  sessionId?: string;
  error?: string;
  ttl: number;
}

export interface GetExecutionsResult {
  executions: TriggerExecution[];
  lastEvaluatedKey?: Record<string, unknown>;
}

export interface CreateTriggerInput {
  userId: string;
  name: string;
  description?: string;
  type: TriggerType;
  agentId: string;
  prompt: string;
  sessionId?: string;
  modelId?: string;
  workingDirectory?: string;
  enabledTools?: string[];
  scheduleConfig?: Omit<ScheduleTriggerConfig, 'schedulerArn' | 'scheduleGroupName'>;
  eventConfig?: Omit<EventTriggerConfig, 'ruleArn'>;
}

export interface UpdateTriggerInput {
  name?: string;
  description?: string;
  type?: TriggerType;
  agentId?: string;
  prompt?: string;
  sessionId?: string;
  modelId?: string;
  workingDirectory?: string;
  enabledTools?: string[];
  enabled?: boolean;
  scheduleConfig?: Partial<ScheduleTriggerConfig>;
  eventConfig?: Partial<EventTriggerConfig>;
}

/**
 * Triggers DynamoDB Service
 */
export class TriggersDynamoDBService {
  private readonly client: DynamoDBClient;
  private readonly tableName: string;

  constructor(tableName: string, region?: string) {
    this.tableName = tableName;
    this.client = new DynamoDBClient({
      region: region || process.env.AWS_REGION || 'us-east-1',
    });
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return !!this.tableName;
  }

  /**
   * Create a new trigger
   */
  async createTrigger(input: CreateTriggerInput): Promise<Trigger> {
    const triggerId = nanoid();
    const now = new Date().toISOString();

    const trigger: Trigger = {
      PK: `TRIGGER#${input.userId}`,
      SK: `TRIGGER#${triggerId}`,
      id: triggerId,
      userId: input.userId,
      name: input.name,
      description: input.description,
      type: input.type,
      enabled: true,
      agentId: input.agentId,
      prompt: input.prompt,
      sessionId: input.sessionId,
      modelId: input.modelId,
      workingDirectory: input.workingDirectory,
      enabledTools: input.enabledTools,
      scheduleConfig: input.scheduleConfig,
      eventConfig: input.eventConfig,
      createdAt: now,
      updatedAt: now,
      GSI1PK: `TYPE#${input.type}`,
      GSI1SK: `USER#${input.userId}#${triggerId}`,
    };

    // Set GSI2 keys for event-type triggers with eventSourceId
    if (input.type === 'event' && input.eventConfig?.eventSourceId) {
      trigger.GSI2PK = `EVENTSOURCE#${input.eventConfig.eventSourceId}`;
      trigger.GSI2SK = `USER#${input.userId}#TRIGGER#${triggerId}`;
    }

    await this.client.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(trigger, { removeUndefinedValues: true }),
      })
    );

    console.log('Trigger created:', { triggerId, userId: input.userId, name: input.name });
    return trigger;
  }

  /**
   * Get a trigger by ID
   */
  async getTrigger(userId: string, triggerId: string): Promise<Trigger | null> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: `TRIGGER#${userId}`,
          SK: `TRIGGER#${triggerId}`,
        }),
      })
    );

    if (!result.Item) {
      return null;
    }

    return unmarshall(result.Item) as Trigger;
  }

  /**
   * List all triggers for a user
   */
  async listTriggers(userId: string): Promise<Trigger[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: marshall({
          ':pk': `TRIGGER#${userId}`,
          ':sk': 'TRIGGER#',
        }),
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => unmarshall(item) as Trigger);
  }

  /**
   * Update a trigger
   */
  async updateTrigger(
    userId: string,
    triggerId: string,
    updates: UpdateTriggerInput
  ): Promise<Trigger> {
    const now = new Date().toISOString();

    // Get existing trigger to check for type changes
    const existingTrigger = await this.getTrigger(userId, triggerId);
    if (!existingTrigger) {
      throw new Error('Trigger not found');
    }

    // Build update expression
    const updateParts: string[] = ['updatedAt = :updatedAt'];
    const removeParts: string[] = [];
    const attributeValues: Record<string, unknown> = {
      ':updatedAt': now,
    };
    const attributeNames: Record<string, string> = {};

    if (updates.name !== undefined) {
      updateParts.push('#name = :name');
      attributeNames['#name'] = 'name';
      attributeValues[':name'] = updates.name;
    }
    if (updates.description !== undefined) {
      updateParts.push('description = :description');
      attributeValues[':description'] = updates.description;
    }
    if (updates.type !== undefined) {
      updateParts.push('#type = :type');
      attributeNames['#type'] = 'type';
      attributeValues[':type'] = updates.type;

      // Update GSI1 keys when type changes
      updateParts.push('GSI1PK = :gsi1pk');
      attributeValues[':gsi1pk'] = `TYPE#${updates.type}`;
    }
    if (updates.agentId !== undefined) {
      updateParts.push('agentId = :agentId');
      attributeValues[':agentId'] = updates.agentId;
    }
    if (updates.prompt !== undefined) {
      updateParts.push('prompt = :prompt');
      attributeValues[':prompt'] = updates.prompt;
    }
    if (updates.sessionId !== undefined) {
      updateParts.push('sessionId = :sessionId');
      attributeValues[':sessionId'] = updates.sessionId;
    }
    if (updates.modelId !== undefined) {
      updateParts.push('modelId = :modelId');
      attributeValues[':modelId'] = updates.modelId;
    }
    if (updates.workingDirectory !== undefined) {
      updateParts.push('workingDirectory = :workingDirectory');
      attributeValues[':workingDirectory'] = updates.workingDirectory;
    }
    if (updates.enabledTools !== undefined) {
      updateParts.push('enabledTools = :enabledTools');
      attributeValues[':enabledTools'] = updates.enabledTools;
    }
    if (updates.enabled !== undefined) {
      updateParts.push('#enabled = :enabled');
      attributeNames['#enabled'] = 'enabled';
      attributeValues[':enabled'] = updates.enabled;
    }
    if (updates.scheduleConfig !== undefined) {
      updateParts.push('scheduleConfig = :scheduleConfig');
      attributeValues[':scheduleConfig'] = updates.scheduleConfig;
    }
    if (updates.eventConfig !== undefined) {
      updateParts.push('eventConfig = :eventConfig');
      attributeValues[':eventConfig'] = updates.eventConfig;
    }

    // Handle GSI2 keys for type changes
    const newType = updates.type || existingTrigger.type;
    const newEventConfig = updates.eventConfig || existingTrigger.eventConfig;

    if (newType === 'event' && newEventConfig?.eventSourceId) {
      // Set GSI2 keys for event type
      updateParts.push('GSI2PK = :gsi2pk', 'GSI2SK = :gsi2sk');
      attributeValues[':gsi2pk'] = `EVENTSOURCE#${newEventConfig.eventSourceId}`;
      attributeValues[':gsi2sk'] = `USER#${userId}#TRIGGER#${triggerId}`;
    } else if (newType === 'schedule') {
      // Remove GSI2 keys for schedule type
      removeParts.push('GSI2PK', 'GSI2SK');
    }

    // Build complete update expression
    let updateExpression = `SET ${updateParts.join(', ')}`;
    if (removeParts.length > 0) {
      updateExpression += ` REMOVE ${removeParts.join(', ')}`;
    }

    await this.client.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: `TRIGGER#${userId}`,
          SK: `TRIGGER#${triggerId}`,
        }),
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: marshall(attributeValues, { removeUndefinedValues: true }),
        ...(Object.keys(attributeNames).length > 0
          ? { ExpressionAttributeNames: attributeNames }
          : {}),
      })
    );

    console.log('Trigger updated:', { triggerId, userId, typeChanged: updates.type !== undefined });

    // Return updated trigger
    const trigger = await this.getTrigger(userId, triggerId);
    if (!trigger) {
      throw new Error('Failed to retrieve updated trigger');
    }
    return trigger;
  }

  /**
   * Delete a trigger
   */
  async deleteTrigger(userId: string, triggerId: string): Promise<void> {
    await this.client.send(
      new DeleteItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: `TRIGGER#${userId}`,
          SK: `TRIGGER#${triggerId}`,
        }),
      })
    );

    console.log('Trigger deleted:', { triggerId, userId });
  }

  /**
   * List triggers subscribed to a specific event source (GSI2)
   */
  async listTriggersByEventSource(eventSourceId: string): Promise<Trigger[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: marshall({
          ':pk': `EVENTSOURCE#${eventSourceId}`,
        }),
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => unmarshall(item) as Trigger);
  }

  /**
   * Get execution history for a trigger with pagination support
   */
  async getExecutions(
    triggerId: string,
    limit: number = 20,
    exclusiveStartKey?: Record<string, unknown>
  ): Promise<GetExecutionsResult> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: marshall({
          ':pk': `TRIGGER#${triggerId}`,
          ':sk': 'EXECUTION#',
        }),
        Limit: limit,
        ScanIndexForward: false, // Most recent first
        ExclusiveStartKey: exclusiveStartKey ? marshall(exclusiveStartKey) : undefined,
      })
    );

    return {
      executions: result.Items
        ? result.Items.map((item) => unmarshall(item) as TriggerExecution)
        : [],
      lastEvaluatedKey: result.LastEvaluatedKey ? unmarshall(result.LastEvaluatedKey) : undefined,
    };
  }
}

// Singleton instance
let triggersServiceInstance: TriggersDynamoDBService | null = null;

/**
 * Get or create TriggersDynamoDBService instance
 */
export function getTriggersDynamoDBService(): TriggersDynamoDBService {
  if (!triggersServiceInstance) {
    const tableName = process.env.TRIGGERS_TABLE_NAME || '';
    const region = process.env.AWS_REGION;
    triggersServiceInstance = new TriggersDynamoDBService(tableName, region);
  }
  return triggersServiceInstance;
}
