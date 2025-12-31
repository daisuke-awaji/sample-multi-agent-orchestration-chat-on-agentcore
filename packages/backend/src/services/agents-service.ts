/**
 * Agent管理サービス
 * DynamoDBを使用してユーザーのAgentを管理
 */

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  DeleteItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
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

  // 共有関連
  isShared: boolean; // 共有フラグ（組織全体に公開）
  createdBy: string; // 作成者名（Cognito username）
}

/**
 * DynamoDB 保存用の Agent 型
 * isShared を文字列型に変換（GSI キー制約対応）
 */
interface DynamoAgent extends Omit<Agent, 'isShared'> {
  isShared: string; // 'true' | 'false'
}

/**
 * Agent を DynamoDB 保存用に変換
 */
function toDynamoAgent(agent: Agent): DynamoAgent {
  return {
    ...agent,
    isShared: agent.isShared ? 'true' : 'false',
  };
}

/**
 * DynamoDB から取得した Agent をアプリケーション用に変換
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
 * Agent管理サービスクラス
 */
export class AgentsService {
  private dynamoClient: DynamoDBClient;
  private tableName: string;

  constructor(tableName: string, region?: string) {
    this.tableName = tableName;
    this.dynamoClient = new DynamoDBClient({ region: region || process.env.AWS_REGION });
  }

  /**
   * ユーザーのAgent一覧を取得
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

      // DynamoDB から取得したデータを Agent 型に変換
      return response.Items.map((item) => fromDynamoAgent(unmarshall(item) as DynamoAgent));
    } catch (error) {
      console.error('Error listing agents:', error);
      throw new Error('Failed to list agents');
    }
  }

  /**
   * 特定のAgentを取得
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

      // DynamoDB から取得したデータを Agent 型に変換
      return fromDynamoAgent(unmarshall(response.Item) as DynamoAgent);
    } catch (error) {
      console.error('Error getting agent:', error);
      throw new Error('Failed to get agent');
    }
  }

  /**
   * 新しいAgentを作成
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
        isShared: false, // デフォルトは非公開
        createdBy: username || userId, // ユーザー名がなければuserIdを使用
      };

      // DynamoDB 保存用に変換（isShared を文字列化）
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
   * Agentを更新
   */
  async updateAgent(userId: string, input: UpdateAgentInput): Promise<Agent> {
    try {
      // 既存のAgentを取得
      const existingAgent = await this.getAgent(userId, input.agentId);

      if (!existingAgent) {
        throw new Error('Agent not found');
      }

      const now = new Date().toISOString();

      // 更新する属性を構築
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

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

      // updatedAtは常に更新
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

      // DynamoDB から取得したデータを Agent 型に変換
      return fromDynamoAgent(unmarshall(response.Attributes) as DynamoAgent);
    } catch (error) {
      console.error('Error updating agent:', error);
      throw error;
    }
  }

  /**
   * Agentを削除
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
   * デフォルトAgentを初期化
   * ユーザーが初めてログインした際に呼び出される
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
   * Agentの共有状態をトグル
   */
  async toggleShare(userId: string, agentId: string): Promise<Agent> {
    try {
      const existingAgent = await this.getAgent(userId, agentId);

      if (!existingAgent) {
        throw new Error('Agent not found');
      }

      const now = new Date().toISOString();
      const newIsShared = !existingAgent.isShared;
      // DynamoDB GSI 用に文字列に変換
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

      // DynamoDB から取得したデータを Agent 型に変換
      return fromDynamoAgent(unmarshall(response.Attributes) as DynamoAgent);
    } catch (error) {
      console.error('Error toggling share:', error);
      throw error;
    }
  }

  /**
   * 共有されたAgent一覧を取得
   */
  async listSharedAgents(limit: number = 20, searchQuery?: string): Promise<Agent[]> {
    try {
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
        ScanIndexForward: false, // 新しい順
        Limit: limit,
      });

      const response = await this.dynamoClient.send(command);

      if (!response.Items || response.Items.length === 0) {
        return [];
      }

      // DynamoDB から取得したデータを Agent 型に変換
      let agents = response.Items.map((item) => fromDynamoAgent(unmarshall(item) as DynamoAgent));

      // 検索クエリがある場合は名前でフィルタリング
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        agents = agents.filter((agent) => agent.name.toLowerCase().includes(query));
      }

      return agents;
    } catch (error) {
      console.error('Error listing shared agents:', error);
      throw new Error('Failed to list shared agents');
    }
  }

  /**
   * 共有されたAgentを取得（任意のユーザーから）
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
   * 共有されたAgentを自分のコレクションにクローン
   */
  async cloneAgent(
    targetUserId: string,
    sourceUserId: string,
    sourceAgentId: string,
    targetUsername?: string
  ): Promise<Agent> {
    try {
      // 元のAgentを取得
      const sourceAgent = await this.getSharedAgent(sourceUserId, sourceAgentId);

      if (!sourceAgent) {
        throw new Error('Shared agent not found');
      }

      // 新しいAgentとして作成
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
 * AgentsService インスタンスを作成
 */
export function createAgentsService(): AgentsService {
  const tableName = config.agentsTableName;
  const region = config.agentcore.region;

  if (!tableName) {
    throw new Error('AGENTS_TABLE_NAME environment variable is not set');
  }

  return new AgentsService(tableName, region);
}
