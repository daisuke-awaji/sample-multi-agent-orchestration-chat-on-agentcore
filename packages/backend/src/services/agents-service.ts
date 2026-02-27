/**
 * Agent Management Service
 * Manages user Agents using DynamoDB
 */

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  DeleteItemCommand,
  UpdateItemCommand,
  AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall, NativeAttributeValue } from '@aws-sdk/util-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';

export interface MCPServer {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  transport?: 'stdio' | 'http' | 'sse';
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServer>;
}

export interface Scenario {
  id: string;
  title: string;
  prompt: string;
}

export interface Agent {
  userId: string;
  agentId: string;
  name: string;
  description: string;
  icon?: string;
  systemPrompt: string;
  enabledTools: string[];
  scenarios: Scenario[];
  mcpConfig?: MCPConfig;
  createdAt: string;
  updatedAt: string;

  // Sharing-related
  isShared: boolean; // Sharing flag (visible to entire organization)
  createdBy: string; // Creator name (Cognito username)
}

/**
 * Agent type for DynamoDB storage
 * Converts isShared to string type (to accommodate GSI key constraints)
 */
interface DynamoAgent extends Omit<Agent, 'isShared'> {
  isShared: string; // 'true' | 'false'
}

/**
 * Convert Agent to DynamoDB storage format
 */
function toDynamoAgent(agent: Agent): DynamoAgent {
  return {
    ...agent,
    isShared: agent.isShared ? 'true' : 'false',
  };
}

/**
 * Convert Agent retrieved from DynamoDB to application format
 */
function fromDynamoAgent(dynamoAgent: DynamoAgent): Agent {
  return {
    ...dynamoAgent,
    isShared: dynamoAgent.isShared === 'true',
  };
}

export interface CreateAgentInput {
  name: string;
  description: string;
  icon?: string;
  systemPrompt: string;
  enabledTools: string[];
  scenarios: Omit<Scenario, 'id'>[];
  mcpConfig?: MCPConfig;
}

export interface UpdateAgentInput extends Partial<CreateAgentInput> {
  agentId: string;
}

/**
 * Pagination result type definition
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}

/**
 * Agent management service class
 */
export class AgentsService {
  private dynamoClient: DynamoDBClient;
  private tableName: string;

  constructor(tableName: string, region?: string) {
    this.tableName = tableName;
    this.dynamoClient = new DynamoDBClient({ region: region || process.env.AWS_REGION });
  }

  /**
   * Get list of Agents for a user
   */
  async listAgents(userId: string): Promise<Agent[]> {
    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: marshall({
          ':userId': userId,
        }),
      });

      const response = await this.dynamoClient.send(command);

      if (!response.Items || response.Items.length === 0) {
        return [];
      }

      // Convert data retrieved from DynamoDB to Agent type
      return response.Items.map((item) => fromDynamoAgent(unmarshall(item) as DynamoAgent));
    } catch (error) {
      console.error('Error listing agents:', error);
      throw new Error('Failed to list agents');
    }
  }

  /**
   * Get a specific Agent
   */
  async getAgent(userId: string, agentId: string): Promise<Agent | null> {
    try {
      const command = new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          userId,
          agentId,
        }),
      });

      const response = await this.dynamoClient.send(command);

      if (!response.Item) {
        return null;
      }

      // Convert data retrieved from DynamoDB to Agent type
      return fromDynamoAgent(unmarshall(response.Item) as DynamoAgent);
    } catch (error) {
      console.error('Error getting agent:', error);
      throw new Error('Failed to get agent');
    }
  }

  /**
   * Create a new Agent
   */
  async createAgent(userId: string, input: CreateAgentInput, username?: string): Promise<Agent> {
    try {
      const now = new Date().toISOString();
      const agentId = uuidv4();

      const agent: Agent = {
        userId,
        agentId,
        name: input.name,
        description: input.description,
        icon: input.icon,
        systemPrompt: input.systemPrompt,
        enabledTools: input.enabledTools,
        scenarios: input.scenarios.map((scenario) => ({
          ...scenario,
          id: uuidv4(),
        })),
        mcpConfig: input.mcpConfig,
        createdAt: now,
        updatedAt: now,
        isShared: false, // Default to private
        createdBy: username || userId, // Use userId if username is not available
      };

      // Convert to DynamoDB storage format (stringify isShared)
      const dynamoAgent = toDynamoAgent(agent);

      const command = new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(dynamoAgent, { removeUndefinedValues: true }),
      });

      await this.dynamoClient.send(command);

      return agent;
    } catch (error) {
      console.error('Error creating agent:', error);
      throw new Error('Failed to create agent');
    }
  }

  /**
   * Update an Agent
   */
  async updateAgent(userId: string, input: UpdateAgentInput): Promise<Agent> {
    try {
      // Retrieve existing Agent
      const existingAgent = await this.getAgent(userId, input.agentId);

      if (!existingAgent) {
        throw new Error('Agent not found');
      }

      const now = new Date().toISOString();

      // Build the attributes to update
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, NativeAttributeValue> = {};

      if (input.name !== undefined) {
        updateExpressions.push('#name = :name');
        expressionAttributeNames['#name'] = 'name';
        expressionAttributeValues[':name'] = input.name;
      }

      if (input.description !== undefined) {
        updateExpressions.push('#description = :description');
        expressionAttributeNames['#description'] = 'description';
        expressionAttributeValues[':description'] = input.description;
      }

      if (input.icon !== undefined) {
        updateExpressions.push('#icon = :icon');
        expressionAttributeNames['#icon'] = 'icon';
        expressionAttributeValues[':icon'] = input.icon;
      }

      if (input.systemPrompt !== undefined) {
        updateExpressions.push('#systemPrompt = :systemPrompt');
        expressionAttributeNames['#systemPrompt'] = 'systemPrompt';
        expressionAttributeValues[':systemPrompt'] = input.systemPrompt;
      }

      if (input.enabledTools !== undefined) {
        updateExpressions.push('#enabledTools = :enabledTools');
        expressionAttributeNames['#enabledTools'] = 'enabledTools';
        expressionAttributeValues[':enabledTools'] = input.enabledTools;
      }

      if (input.scenarios !== undefined) {
        const scenariosWithIds = input.scenarios.map((scenario) => ({
          ...scenario,
          id: uuidv4(),
        }));
        updateExpressions.push('#scenarios = :scenarios');
        expressionAttributeNames['#scenarios'] = 'scenarios';
        expressionAttributeValues[':scenarios'] = scenariosWithIds;
      }

      if (input.mcpConfig !== undefined) {
        updateExpressions.push('#mcpConfig = :mcpConfig');
        expressionAttributeNames['#mcpConfig'] = 'mcpConfig';
        expressionAttributeValues[':mcpConfig'] = input.mcpConfig;
      }

      // updatedAt is always updated
      updateExpressions.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'updatedAt';
      expressionAttributeValues[':updatedAt'] = now;

      const command = new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({
          userId,
          agentId: input.agentId,
        }),
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: marshall(expressionAttributeValues, {
          removeUndefinedValues: true,
        }),
        ReturnValues: 'ALL_NEW',
      });

      const response = await this.dynamoClient.send(command);

      if (!response.Attributes) {
        throw new Error('Failed to update agent');
      }

      // Convert data retrieved from DynamoDB to Agent type
      return fromDynamoAgent(unmarshall(response.Attributes) as DynamoAgent);
    } catch (error) {
      console.error('Error updating agent:', error);
      throw error;
    }
  }

  /**
   * Delete an Agent
   */
  async deleteAgent(userId: string, agentId: string): Promise<void> {
    try {
      const command = new DeleteItemCommand({
        TableName: this.tableName,
        Key: marshall({
          userId,
          agentId,
        }),
      });

      await this.dynamoClient.send(command);
    } catch (error) {
      console.error('Error deleting agent:', error);
      throw new Error('Failed to delete agent');
    }
  }

  /**
   * Initialize default Agents
   * Called when a user logs in for the first time
   */
  async initializeDefaultAgents(
    userId: string,
    defaultAgents: CreateAgentInput[],
    username?: string
  ): Promise<Agent[]> {
    try {
      const createdAgents: Agent[] = [];

      for (const agentInput of defaultAgents) {
        const agent = await this.createAgent(userId, agentInput, username);
        createdAgents.push(agent);
      }

      return createdAgents;
    } catch (error) {
      console.error('Error initializing default agents:', error);
      throw new Error('Failed to initialize default agents');
    }
  }

  /**
   * Toggle the sharing state of an Agent
   */
  async toggleShare(userId: string, agentId: string): Promise<Agent> {
    try {
      const existingAgent = await this.getAgent(userId, agentId);

      if (!existingAgent) {
        throw new Error('Agent not found');
      }

      const now = new Date().toISOString();
      const newIsShared = !existingAgent.isShared;
      // Convert to string for DynamoDB GSI
      const newIsSharedStr = newIsShared ? 'true' : 'false';

      const command = new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({
          userId,
          agentId,
        }),
        UpdateExpression: 'SET #isShared = :isShared, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#isShared': 'isShared',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: marshall({
          ':isShared': newIsSharedStr,
          ':updatedAt': now,
        }),
        ReturnValues: 'ALL_NEW',
      });

      const response = await this.dynamoClient.send(command);

      if (!response.Attributes) {
        throw new Error('Failed to toggle share');
      }

      // Convert data retrieved from DynamoDB to Agent type
      return fromDynamoAgent(unmarshall(response.Attributes) as DynamoAgent);
    } catch (error) {
      console.error('Error toggling share:', error);
      throw error;
    }
  }

  /**
   * Get list of shared Agents (with pagination support)
   */
  async listSharedAgents(
    limit: number = 20,
    searchQuery?: string,
    cursor?: string
  ): Promise<PaginatedResult<Agent>> {
    try {
      // Decode cursor
      let exclusiveStartKey: Record<string, AttributeValue> | undefined;
      if (cursor) {
        try {
          const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
          exclusiveStartKey = JSON.parse(decoded);
        } catch (error) {
          console.error('Invalid cursor format:', error);
          throw new Error('Invalid pagination cursor');
        }
      }

      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'isShared-createdAt-index',
        KeyConditionExpression: '#isShared = :isShared',
        ExpressionAttributeNames: {
          '#isShared': 'isShared',
        },
        ExpressionAttributeValues: marshall({
          ':isShared': 'true',
        }),
        ScanIndexForward: false, // Newest first
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey ? marshall(exclusiveStartKey) : undefined,
      });

      const response = await this.dynamoClient.send(command);

      if (!response.Items || response.Items.length === 0) {
        return {
          items: [],
          hasMore: false,
        };
      }

      // Convert data retrieved from DynamoDB to Agent type
      let agents = response.Items.map((item) => fromDynamoAgent(unmarshall(item) as DynamoAgent));

      // Filter by name if search query is provided
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        agents = agents.filter((agent) => agent.name.toLowerCase().includes(query));
      }

      // Encode next cursor
      let nextCursor: string | undefined;
      if (response.LastEvaluatedKey) {
        const unmarshalled = unmarshall(response.LastEvaluatedKey);
        nextCursor = Buffer.from(JSON.stringify(unmarshalled)).toString('base64');
      }

      return {
        items: agents,
        nextCursor,
        hasMore: !!response.LastEvaluatedKey,
      };
    } catch (error) {
      console.error('Error listing shared agents:', error);
      throw error instanceof Error ? error : new Error('Failed to list shared agents');
    }
  }

  /**
   * Get a shared Agent (from any user)
   */
  async getSharedAgent(userId: string, agentId: string): Promise<Agent | null> {
    try {
      const agent = await this.getAgent(userId, agentId);

      if (!agent || !agent.isShared) {
        return null;
      }

      return agent;
    } catch (error) {
      console.error('Error getting shared agent:', error);
      throw new Error('Failed to get shared agent');
    }
  }

  /**
   * Clone a shared Agent into your own collection
   */
  async cloneAgent(
    targetUserId: string,
    sourceUserId: string,
    sourceAgentId: string,
    targetUsername?: string
  ): Promise<Agent> {
    try {
      // Retrieve the original Agent
      const sourceAgent = await this.getSharedAgent(sourceUserId, sourceAgentId);

      if (!sourceAgent) {
        throw new Error('Shared agent not found');
      }

      // Create as a new Agent
      const input: CreateAgentInput = {
        name: sourceAgent.name,
        description: sourceAgent.description,
        icon: sourceAgent.icon,
        systemPrompt: sourceAgent.systemPrompt,
        enabledTools: sourceAgent.enabledTools,
        scenarios: sourceAgent.scenarios.map((s) => ({
          title: s.title,
          prompt: s.prompt,
        })),
        mcpConfig: sourceAgent.mcpConfig,
      };

      return await this.createAgent(targetUserId, input, targetUsername);
    } catch (error) {
      console.error('Error cloning agent:', error);
      throw error;
    }
  }
}

/**
 * Create an AgentsService instance
 */
export function createAgentsService(): AgentsService {
  const tableName = config.agentsTableName;
  const region = config.agentcore.region;

  if (!tableName) {
    throw new Error('AGENTS_TABLE_NAME environment variable is not set');
  }

  return new AgentsService(tableName, region);
}
