/**
 * Agent management service for Trigger package
 * Provides read-only access to Agent data from DynamoDB
 */

import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

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
  isShared: boolean;
  createdBy: string;
}

/**
 * DynamoDB storage format for Agent
 * isShared is stored as string for GSI key constraints
 */
interface DynamoAgent extends Omit<Agent, 'isShared'> {
  isShared: string; // 'true' | 'false'
}

/**
 * Convert DynamoDB Agent to application Agent
 */
function fromDynamoAgent(dynamoAgent: DynamoAgent): Agent {
  return {
    ...dynamoAgent,
    isShared: dynamoAgent.isShared === 'true',
  };
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
   * Get specific Agent
   */
  async getAgent(userId: string, agentId: string): Promise<Agent | null> {
    try {
      const command = new GetItemCommand({
        TableName: this.tableName,
        Key: {
          userId: { S: userId },
          agentId: { S: agentId },
        },
      });

      const response = await this.dynamoClient.send(command);

      if (!response.Item) {
        return null;
      }

      // Convert DynamoDB data to Agent type
      return fromDynamoAgent(unmarshall(response.Item) as DynamoAgent);
    } catch (error) {
      console.error('Error getting agent:', error);
      throw new Error('Failed to get agent');
    }
  }
}

/**
 * Create AgentsService instance
 */
export function createAgentsService(): AgentsService {
  const tableName = process.env.AGENTS_TABLE_NAME;
  const region = process.env.AWS_REGION;

  if (!tableName) {
    throw new Error('AGENTS_TABLE_NAME environment variable is not set');
  }

  return new AgentsService(tableName, region);
}
