/**
 * Sessions Service - DynamoDB operations for session management
 */
import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { logger } from '../config/index.js';
import { createUserScopedDynamoDBClient } from '../utils/scoped-credentials.js';

/**
 * Session type
 */
export type SessionType = 'user' | 'event' | 'subagent';

/**
 * Session data stored in DynamoDB
 */
export interface SessionData {
  userId: string;
  sessionId: string;
  title: string;
  agentId?: string;
  storagePath?: string;
  sessionType?: SessionType;
  createdAt: string;
  updatedAt: string;
}

/**
 * Options for creating a new session
 */
export interface CreateSessionOptions {
  userId: string;
  sessionId: string;
  title: string;
  agentId?: string;
  storagePath?: string;
  sessionType?: SessionType;
}

/**
 * Sessions Service for DynamoDB operations
 */
export class SessionsService {
  private defaultClient: DynamoDBClient;
  private tableName: string;

  constructor(tableName?: string, region?: string) {
    const actualRegion = region || process.env.AWS_REGION || 'us-east-1';
    this.defaultClient = new DynamoDBClient({ region: actualRegion });
    this.tableName = tableName || process.env.SESSIONS_TABLE_NAME || '';

    if (!this.tableName) {
      logger.warn('[SessionsService] SESSIONS_TABLE_NAME not configured');
    }
  }

  /**
   * Get a DynamoDB client scoped to the given user.
   * When USER_SCOPED_ROLE_ARN is configured, assumes a role with a session policy
   * that restricts access to items where the partition key matches the userId.
   * Falls back to the default client for local development or when scoping is not configured.
   */
  private async getClient(userId: string): Promise<DynamoDBClient> {
    if (process.env.USER_SCOPED_ROLE_ARN) {
      try {
        return await createUserScopedDynamoDBClient(userId);
      } catch (error) {
        logger.warn(
          '[SessionsService] Failed to create user-scoped client, falling back to default:',
          { error }
        );
        return this.defaultClient;
      }
    }
    return this.defaultClient;
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return !!this.tableName;
  }

  /**
   * Check if session exists
   */
  async sessionExists(userId: string, sessionId: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const client = await this.getClient(userId);
      const result = await client.send(
        new GetItemCommand({
          TableName: this.tableName,
          Key: marshall({ userId, sessionId }),
          ProjectionExpression: 'userId',
        })
      );
      return !!result.Item;
    } catch (error) {
      logger.error('[SessionsService] Error checking session existence:', { error });
      return false;
    }
  }

  /**
   * Create a new session
   */
  async createSession(options: CreateSessionOptions): Promise<SessionData> {
    if (!this.isConfigured()) {
      throw new Error('SessionsService not configured: SESSIONS_TABLE_NAME is missing');
    }

    const now = new Date().toISOString();
    const item: SessionData = {
      userId: options.userId,
      sessionId: options.sessionId,
      title: options.title,
      agentId: options.agentId,
      storagePath: options.storagePath,
      sessionType: options.sessionType,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const client = await this.getClient(options.userId);
      await client.send(
        new PutItemCommand({
          TableName: this.tableName,
          Item: marshall(item, { removeUndefinedValues: true }),
          ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(sessionId)',
        })
      );

      logger.info('[SessionsService] Created session:', {
        userId: options.userId,
        sessionId: options.sessionId,
        title: options.title,
      });

      return item;
    } catch (error: unknown) {
      // If session already exists, this is not an error - just skip
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
        logger.info('[SessionsService] Session already exists, skipping creation:', {
          userId: options.userId,
          sessionId: options.sessionId,
        });
        // Return existing session data
        return {
          ...item,
          createdAt: now, // We don't know actual createdAt, but it's fine
        };
      }
      logger.error('[SessionsService] Error creating session:', { error });
      throw error;
    }
  }

  /**
   * Update session's updatedAt timestamp
   */
  async updateSessionTimestamp(userId: string, sessionId: string): Promise<void> {
    if (!this.isConfigured()) {
      logger.warn('[SessionsService] Not configured, skipping timestamp update');
      return;
    }

    const now = new Date().toISOString();

    try {
      const client = await this.getClient(userId);
      await client.send(
        new UpdateItemCommand({
          TableName: this.tableName,
          Key: marshall({ userId, sessionId }),
          UpdateExpression: 'SET updatedAt = :updatedAt',
          ExpressionAttributeValues: marshall({ ':updatedAt': now }),
          ConditionExpression: 'attribute_exists(userId) AND attribute_exists(sessionId)',
        })
      );

      logger.debug('[SessionsService] Updated session timestamp:', {
        userId,
        sessionId,
        updatedAt: now,
      });
    } catch (error: unknown) {
      // If session doesn't exist, log warning but don't throw
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
        logger.warn('[SessionsService] Session not found for timestamp update:', {
          userId,
          sessionId,
        });
        return;
      }
      logger.error('[SessionsService] Error updating session timestamp:', { error });
      throw error;
    }
  }

  /**
   * Get session data
   */
  async getSession(userId: string, sessionId: string): Promise<SessionData | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const client = await this.getClient(userId);
      const result = await client.send(
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
      logger.error('[SessionsService] Error getting session:', { error });
      throw error;
    }
  }

  /**
   * Update session's agentId, storagePath and timestamp
   * Used when continuing an existing session with potentially different agent/storage settings
   */
  async updateSessionAgentAndStorage(
    userId: string,
    sessionId: string,
    agentId?: string,
    storagePath?: string
  ): Promise<void> {
    if (!this.isConfigured()) {
      logger.warn('[SessionsService] Not configured, skipping agent/storage update');
      return;
    }

    const now = new Date().toISOString();

    // Build update expression dynamically based on provided values
    const updateParts: string[] = ['updatedAt = :updatedAt'];
    const expressionValues: Record<string, string | undefined> = { ':updatedAt': now };

    if (agentId !== undefined) {
      updateParts.push('agentId = :agentId');
      expressionValues[':agentId'] = agentId;
    }

    if (storagePath !== undefined) {
      updateParts.push('storagePath = :storagePath');
      expressionValues[':storagePath'] = storagePath;
    }

    try {
      const client = await this.getClient(userId);
      await client.send(
        new UpdateItemCommand({
          TableName: this.tableName,
          Key: marshall({ userId, sessionId }),
          UpdateExpression: `SET ${updateParts.join(', ')}`,
          ExpressionAttributeValues: marshall(expressionValues, { removeUndefinedValues: true }),
          ConditionExpression: 'attribute_exists(userId) AND attribute_exists(sessionId)',
        })
      );

      logger.info('[SessionsService] Updated session agentId/storagePath:', {
        userId,
        sessionId,
        agentId,
        storagePath,
        updatedAt: now,
      });
    } catch (error: unknown) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
        logger.warn('[SessionsService] Session not found for agent/storage update:', {
          userId,
          sessionId,
        });
        return;
      }
      logger.error('[SessionsService] Error updating session agent/storage:', { error });
      throw error;
    }
  }

  /**
   * Update session title
   */
  async updateSessionTitle(userId: string, sessionId: string, title: string): Promise<void> {
    if (!this.isConfigured()) {
      logger.warn('[SessionsService] Not configured, skipping title update');
      return;
    }

    const now = new Date().toISOString();

    try {
      const client = await this.getClient(userId);
      await client.send(
        new UpdateItemCommand({
          TableName: this.tableName,
          Key: marshall({ userId, sessionId }),
          UpdateExpression: 'SET title = :title, updatedAt = :updatedAt',
          ExpressionAttributeValues: marshall({
            ':title': title,
            ':updatedAt': now,
          }),
          ConditionExpression: 'attribute_exists(userId) AND attribute_exists(sessionId)',
        })
      );

      logger.info('[SessionsService] Updated session title:', {
        userId,
        sessionId,
        title,
      });
    } catch (error: unknown) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
        logger.warn('[SessionsService] Session not found for title update:', {
          userId,
          sessionId,
        });
        return;
      }
      logger.error('[SessionsService] Error updating session title:', { error });
      throw error;
    }
  }
}

// Singleton instance
let sessionsServiceInstance: SessionsService | null = null;

/**
 * Get or create SessionsService singleton
 */
export function getSessionsService(): SessionsService {
  if (!sessionsServiceInstance) {
    sessionsServiceInstance = new SessionsService();
  }
  return sessionsServiceInstance;
}
