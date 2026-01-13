/**
 * Sessions DynamoDB Service
 * Service for managing session data in DynamoDB
 */

import {
  DynamoDBClient,
  QueryCommand,
  DeleteItemCommand,
  GetItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { config } from '../config/index.js';

/**
 * Session data stored in DynamoDB
 */
export interface SessionData {
  userId: string;
  sessionId: string;
  title: string;
  agentId?: string;
  workingDirectory?: string;
  modelId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Session summary for frontend display
 */
export interface SessionSummary {
  sessionId: string;
  title: string;
  agentId?: string;
  workingDirectory?: string;
  modelId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Update session input
 */
export interface UpdateSessionInput {
  agentId?: string | null;
  workingDirectory?: string;
  modelId?: string;
  title?: string;
}

/**
 * Session list result with pagination
 */
export interface SessionListResult {
  sessions: SessionSummary[];
  nextToken?: string;
  hasMore: boolean;
}

/**
 * Sessions DynamoDB Service
 */
export class SessionsDynamoDBService {
  private client: DynamoDBClient;
  private tableName: string;

  constructor() {
    this.client = new DynamoDBClient({ region: config.agentcore.region });
    this.tableName = config.sessionsTableName || '';
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return !!this.tableName;
  }

  /**
   * List sessions for a user (sorted by updatedAt descending)
   */
  async listSessions(
    userId: string,
    maxResults: number = 50,
    nextToken?: string
  ): Promise<SessionListResult> {
    if (!this.isConfigured()) {
      console.warn('[SessionsDynamoDBService] SESSIONS_TABLE_NAME not configured');
      return { sessions: [], hasMore: false };
    }

    try {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'userId-updatedAt-index',
          KeyConditionExpression: 'userId = :userId',
          ExpressionAttributeValues: marshall({ ':userId': userId }),
          ScanIndexForward: false, // Sort descending (newest first)
          Limit: maxResults,
          ExclusiveStartKey: nextToken
            ? JSON.parse(Buffer.from(nextToken, 'base64').toString())
            : undefined,
        })
      );

      const sessions: SessionSummary[] = (result.Items || []).map((item) => {
        const data = unmarshall(item) as SessionData;
        return {
          sessionId: data.sessionId,
          title: data.title,
          agentId: data.agentId,
          workingDirectory: data.workingDirectory,
          modelId: data.modelId,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });

      const hasMore = !!result.LastEvaluatedKey;
      const newNextToken = result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : undefined;

      console.log(
        `[SessionsDynamoDBService] Listed ${sessions.length} sessions for user ${userId}`
      );

      return {
        sessions,
        nextToken: newNextToken,
        hasMore,
      };
    } catch (error) {
      console.error('[SessionsDynamoDBService] Error listing sessions:', error);
      throw error;
    }
  }

  /**
   * Get a single session
   */
  async getSession(userId: string, sessionId: string): Promise<SessionData | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const result = await this.client.send(
        new GetItemCommand({
          TableName: this.tableName,
          Key: marshall({ userId, sessionId }),
        })
      );

      if (!result.Item) {
        return null;
      }

      return unmarshall(result.Item) as SessionData;
    } catch (error) {
      console.error('[SessionsDynamoDBService] Error getting session:', error);
      throw error;
    }
  }

  /**
   * Delete a session from DynamoDB
   */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    if (!this.isConfigured()) {
      console.warn('[SessionsDynamoDBService] SESSIONS_TABLE_NAME not configured, skipping delete');
      return;
    }

    try {
      await this.client.send(
        new DeleteItemCommand({
          TableName: this.tableName,
          Key: marshall({ userId, sessionId }),
        })
      );

      console.log(`[SessionsDynamoDBService] Deleted session ${sessionId} for user ${userId}`);
    } catch (error) {
      console.error('[SessionsDynamoDBService] Error deleting session:', error);
      throw error;
    }
  }

  /**
   * Update a session in DynamoDB
   */
  async updateSession(
    userId: string,
    sessionId: string,
    updates: UpdateSessionInput
  ): Promise<SessionData> {
    if (!this.isConfigured()) {
      throw new Error('SESSIONS_TABLE_NAME not configured');
    }

    const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
    const expressionAttributeNames: Record<string, string> = {
      '#updatedAt': 'updatedAt',
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ':updatedAt': new Date().toISOString(),
    };

    if (updates.title !== undefined) {
      updateExpressions.push('#title = :title');
      expressionAttributeNames['#title'] = 'title';
      expressionAttributeValues[':title'] = updates.title;
    }

    if (updates.agentId !== undefined) {
      if (updates.agentId === null) {
        updateExpressions.push('REMOVE #agentId');
        expressionAttributeNames['#agentId'] = 'agentId';
      } else {
        updateExpressions.push('#agentId = :agentId');
        expressionAttributeNames['#agentId'] = 'agentId';
        expressionAttributeValues[':agentId'] = updates.agentId;
      }
    }

    if (updates.workingDirectory !== undefined) {
      updateExpressions.push('#workingDirectory = :workingDirectory');
      expressionAttributeNames['#workingDirectory'] = 'workingDirectory';
      expressionAttributeValues[':workingDirectory'] = updates.workingDirectory;
    }

    if (updates.modelId !== undefined) {
      updateExpressions.push('#modelId = :modelId');
      expressionAttributeNames['#modelId'] = 'modelId';
      expressionAttributeValues[':modelId'] = updates.modelId;
    }

    // Build SET and REMOVE parts
    const setParts = updateExpressions.filter((e) => !e.startsWith('REMOVE'));
    const removeParts = updateExpressions.filter((e) => e.startsWith('REMOVE'));

    let updateExpression = '';
    if (setParts.length > 0) {
      updateExpression = 'SET ' + setParts.join(', ');
    }
    if (removeParts.length > 0) {
      const removeFields = removeParts.map((e) => e.replace('REMOVE ', ''));
      updateExpression += (updateExpression ? ' ' : '') + 'REMOVE ' + removeFields.join(', ');
    }

    try {
      const result = await this.client.send(
        new UpdateItemCommand({
          TableName: this.tableName,
          Key: marshall({ userId, sessionId }),
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues:
            Object.keys(expressionAttributeValues).length > 0
              ? marshall(expressionAttributeValues)
              : undefined,
          ReturnValues: 'ALL_NEW',
        })
      );

      if (!result.Attributes) {
        throw new Error('Session not found');
      }

      const updatedSession = unmarshall(result.Attributes) as SessionData;
      console.log(
        `[SessionsDynamoDBService] Updated session ${sessionId} for user ${userId}:`,
        updates
      );

      return updatedSession;
    } catch (error) {
      console.error('[SessionsDynamoDBService] Error updating session:', error);
      throw error;
    }
  }
}

// Singleton instance
let sessionsDynamoDBServiceInstance: SessionsDynamoDBService | null = null;

/**
 * Get or create SessionsDynamoDBService singleton
 */
export function getSessionsDynamoDBService(): SessionsDynamoDBService {
  if (!sessionsDynamoDBServiceInstance) {
    sessionsDynamoDBServiceInstance = new SessionsDynamoDBService();
  }
  return sessionsDynamoDBServiceInstance;
}
