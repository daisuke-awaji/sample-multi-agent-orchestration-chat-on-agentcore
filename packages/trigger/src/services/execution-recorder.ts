/**
 * Service for recording trigger execution history in DynamoDB
 */

import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { nanoid } from 'nanoid';
import { TriggerExecution, TriggerExecutionStatus } from '../types/index.js';

/**
 * Service for managing trigger execution records
 */
export class ExecutionRecorder {
  private readonly dynamoClient: DynamoDBClient;
  private readonly tableName: string;

  constructor(tableName: string, region?: string) {
    this.tableName = tableName;
    // Explicitly prioritize provided region over environment
    const clientRegion =
      region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-northeast-1';
    console.log(`Initializing DynamoDB client with region: ${clientRegion}`);
    this.dynamoClient = new DynamoDBClient({
      region: clientRegion,
    });
  }

  /**
   * Start a new execution record
   */
  async startExecution(triggerId: string, userId: string): Promise<string> {
    const executionId = nanoid();
    const now = new Date().toISOString();

    // TTL: 30 days from now
    const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

    const execution: TriggerExecution = {
      PK: `TRIGGER#${triggerId}`,
      SK: `EXECUTION#${executionId}`,
      triggerId,
      executionId,
      userId,
      startedAt: now,
      status: 'running',
      ttl,
    };

    await this.dynamoClient.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(execution, { removeUndefinedValues: true }),
      })
    );

    console.log('Execution record created:', {
      triggerId,
      executionId,
      userId,
    });

    return executionId;
  }

  /**
   * Complete an execution record with success
   */
  async completeExecution(
    triggerId: string,
    executionId: string,
    requestId: string,
    sessionId?: string
  ): Promise<void> {
    const now = new Date().toISOString();

    await this.dynamoClient.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: `TRIGGER#${triggerId}`,
          SK: `EXECUTION#${executionId}`,
        }),
        UpdateExpression:
          'SET #status = :status, completedAt = :completedAt, requestId = :requestId, sessionId = :sessionId',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: marshall(
          {
            ':status': 'completed' as TriggerExecutionStatus,
            ':completedAt': now,
            ':requestId': requestId,
            ':sessionId': sessionId || null,
          },
          { removeUndefinedValues: true }
        ),
      })
    );

    console.log('Execution completed:', {
      triggerId,
      executionId,
      requestId,
      sessionId,
    });
  }

  /**
   * Fail an execution record with error
   */
  async failExecution(triggerId: string, executionId: string, error: string): Promise<void> {
    const now = new Date().toISOString();

    await this.dynamoClient.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: `TRIGGER#${triggerId}`,
          SK: `EXECUTION#${executionId}`,
        }),
        UpdateExpression: 'SET #status = :status, completedAt = :completedAt, #error = :error',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#error': 'error',
        },
        ExpressionAttributeValues: marshall({
          ':status': 'failed' as TriggerExecutionStatus,
          ':completedAt': now,
          ':error': error,
        }),
      })
    );

    console.error('Execution failed:', {
      triggerId,
      executionId,
      error,
    });
  }

  /**
   * Update trigger's last execution timestamp
   */
  async updateTriggerLastExecution(userId: string, triggerId: string): Promise<void> {
    const now = new Date().toISOString();

    try {
      await this.dynamoClient.send(
        new UpdateItemCommand({
          TableName: this.tableName,
          Key: marshall({
            PK: `TRIGGER#${userId}`,
            SK: `TRIGGER#${triggerId}`,
          }),
          UpdateExpression: 'SET lastExecutedAt = :lastExecutedAt',
          ExpressionAttributeValues: marshall({
            ':lastExecutedAt': now,
          }),
        })
      );

      console.log('Trigger last execution updated:', {
        userId,
        triggerId,
        lastExecutedAt: now,
      });
    } catch (error) {
      console.warn('Failed to update trigger last execution (non-critical):', error);
    }
  }

  /**
   * Create ExecutionRecorder from environment variables
   */
  static fromEnvironment(): ExecutionRecorder {
    const tableName = process.env.TRIGGERS_TABLE_NAME;
    const region = process.env.AWS_REGION;

    if (!tableName) {
      throw new Error('TRIGGERS_TABLE_NAME environment variable is required');
    }

    return new ExecutionRecorder(tableName, region);
  }
}
