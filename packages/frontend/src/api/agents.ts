/**
 * Agent Management API Client
 */

import { getValidAccessToken } from '../lib/cognito';
import type { Agent, CreateAgentInput } from '../types/agent';

export interface AgentResponse {
  agent: Agent;
  metadata: {
    requestId: string;
    timestamp: string;
    userId: string;
  };
}

export interface AgentsListResponse {
  agents: Agent[];
  metadata: {
    requestId: string;
    timestamp: string;
    userId: string;
    count: number;
  };
}

export interface InitializeAgentsResponse {
  agents: Agent[];
  skipped: boolean;
  message?: string;
  metadata: {
    requestId: string;
    timestamp: string;
    userId: string;
    count: number;
  };
}

/**
 * Backend API のベース URL を取得
 */
function getBackendBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
  return baseUrl.replace(/\/$/, '');
}

/**
 * 認証ヘッダーを作成
 */
async function createAuthHeaders(): Promise<Record<string, string>> {
  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    throw new Error('認証が必要です。再ログインしてください。');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

/**
 * Get list of user's agents
 */
export async function listAgents(): Promise<Agent[]> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = await createAuthHeaders();

    console.log('📋 Agent一覧取得開始...');

    const response = await fetch(`${baseUrl}/agents`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Agent一覧の取得に失敗しました: ${response.status} ${response.statusText} - ${
          errorData.message || 'Unknown error'
        }`
      );
    }

    const data: AgentsListResponse = await response.json();
    console.log(`✅ Agent一覧取得完了: ${data.agents.length}件`);

    return data.agents.map((agent) => ({
      ...agent,
      createdAt: new Date(agent.createdAt),
      updatedAt: new Date(agent.updatedAt),
    }));
  } catch (error) {
    console.error('💥 Agent一覧取得エラー:', error);
    throw error;
  }
}

/**
 * Get a specific agent
 */
export async function getAgent(agentId: string): Promise<Agent> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = await createAuthHeaders();

    console.log(`🔍 Agent取得開始: ${agentId}`);

    const response = await fetch(`${baseUrl}/agents/${agentId}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Agentの取得に失敗しました: ${response.status} ${response.statusText} - ${
          errorData.message || 'Unknown error'
        }`
      );
    }

    const data: AgentResponse = await response.json();
    console.log(`✅ Agent取得完了: ${data.agent.name}`);

    return {
      ...data.agent,
      createdAt: new Date(data.agent.createdAt),
      updatedAt: new Date(data.agent.updatedAt),
    };
  } catch (error) {
    console.error('💥 Agent取得エラー:', error);
    throw error;
  }
}

/**
 * Create a new agent
 */
export async function createAgent(input: CreateAgentInput): Promise<Agent> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = await createAuthHeaders();

    console.log(`➕ Agent作成開始: ${input.name}`);

    const response = await fetch(`${baseUrl}/agents`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Agentの作成に失敗しました: ${response.status} ${response.statusText} - ${
          errorData.message || 'Unknown error'
        }`
      );
    }

    const data: AgentResponse = await response.json();
    console.log(`✅ Agent作成完了: ${data.agent.id}`);

    return {
      ...data.agent,
      createdAt: new Date(data.agent.createdAt),
      updatedAt: new Date(data.agent.updatedAt),
    };
  } catch (error) {
    console.error('💥 Agent作成エラー:', error);
    throw error;
  }
}

/**
 * Update an existing agent
 */
export async function updateAgent(
  agentId: string,
  input: Partial<CreateAgentInput>
): Promise<Agent> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = await createAuthHeaders();

    console.log(`📝 Agent更新開始: ${agentId}`);

    const response = await fetch(`${baseUrl}/agents/${agentId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Agentの更新に失敗しました: ${response.status} ${response.statusText} - ${
          errorData.message || 'Unknown error'
        }`
      );
    }

    const data: AgentResponse = await response.json();
    console.log(`✅ Agent更新完了: ${data.agent.name}`);

    return {
      ...data.agent,
      createdAt: new Date(data.agent.createdAt),
      updatedAt: new Date(data.agent.updatedAt),
    };
  } catch (error) {
    console.error('💥 Agent更新エラー:', error);
    throw error;
  }
}

/**
 * Delete an agent
 */
export async function deleteAgent(agentId: string): Promise<void> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = await createAuthHeaders();

    console.log(`🗑️  Agent削除開始: ${agentId}`);

    const response = await fetch(`${baseUrl}/agents/${agentId}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Agentの削除に失敗しました: ${response.status} ${response.statusText} - ${
          errorData.message || 'Unknown error'
        }`
      );
    }

    console.log(`✅ Agent削除完了: ${agentId}`);
  } catch (error) {
    console.error('💥 Agent削除エラー:', error);
    throw error;
  }
}

/**
 * Initialize default agents for new users
 */
export async function initializeDefaultAgents(): Promise<Agent[]> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = await createAuthHeaders();

    console.log('🔧 デフォルトAgent初期化開始...');

    const response = await fetch(`${baseUrl}/agents/initialize`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `デフォルトAgentの初期化に失敗しました: ${response.status} ${response.statusText} - ${
          errorData.message || 'Unknown error'
        }`
      );
    }

    const data: InitializeAgentsResponse = await response.json();
    console.log(`✅ デフォルトAgent初期化完了: ${data.agents.length}件`);

    return data.agents.map((agent) => ({
      ...agent,
      createdAt: new Date(agent.createdAt),
      updatedAt: new Date(agent.updatedAt),
    }));
  } catch (error) {
    console.error('💥 デフォルトAgent初期化エラー:', error);
    throw error;
  }
}

/**
 * Toggle agent share status
 */
export async function toggleShareAgent(agentId: string): Promise<Agent> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = await createAuthHeaders();

    console.log(`🔄 Agent共有状態トグル開始: ${agentId}`);

    const response = await fetch(`${baseUrl}/agents/${agentId}/share`, {
      method: 'PUT',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Agent共有状態の変更に失敗しました: ${response.status} ${response.statusText} - ${
          errorData.message || 'Unknown error'
        }`
      );
    }

    const data: AgentResponse = await response.json();
    console.log(`✅ Agent共有状態トグル完了: isShared=${data.agent.isShared}`);

    return {
      ...data.agent,
      createdAt: new Date(data.agent.createdAt),
      updatedAt: new Date(data.agent.updatedAt),
    };
  } catch (error) {
    console.error('💥 Agent共有状態トグルエラー:', error);
    throw error;
  }
}

/**
 * List shared agents
 */
export async function listSharedAgents(searchQuery?: string, limit?: number): Promise<Agent[]> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = await createAuthHeaders();

    const params = new URLSearchParams();
    if (searchQuery) params.append('q', searchQuery);
    if (limit) params.append('limit', limit.toString());

    const queryString = params.toString();
    const url = `${baseUrl}/agents/shared-agents/list${queryString ? `?${queryString}` : ''}`;

    console.log('📋 共有Agent一覧取得開始...', { searchQuery, limit });

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `共有Agent一覧の取得に失敗しました: ${response.status} ${response.statusText} - ${
          errorData.message || 'Unknown error'
        }`
      );
    }

    const data: AgentsListResponse = await response.json();
    console.log(`✅ 共有Agent一覧取得完了: ${data.agents.length}件`);

    return data.agents.map((agent) => ({
      ...agent,
      createdAt: new Date(agent.createdAt),
      updatedAt: new Date(agent.updatedAt),
    }));
  } catch (error) {
    console.error('💥 共有Agent一覧取得エラー:', error);
    throw error;
  }
}

/**
 * Get shared agent details
 */
export async function getSharedAgent(userId: string, agentId: string): Promise<Agent> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = await createAuthHeaders();

    console.log(`🔍 共有Agent詳細取得開始: ${userId}/${agentId}`);

    const response = await fetch(`${baseUrl}/agents/shared-agents/${userId}/${agentId}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `共有Agent詳細の取得に失敗しました: ${response.status} ${response.statusText} - ${
          errorData.message || 'Unknown error'
        }`
      );
    }

    const data: AgentResponse = await response.json();
    console.log(`✅ 共有Agent詳細取得完了: ${data.agent.name}`);

    return {
      ...data.agent,
      createdAt: new Date(data.agent.createdAt),
      updatedAt: new Date(data.agent.updatedAt),
    };
  } catch (error) {
    console.error('💥 共有Agent詳細取得エラー:', error);
    throw error;
  }
}

/**
 * Clone shared agent to my agents
 */
export async function cloneSharedAgent(userId: string, agentId: string): Promise<Agent> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = await createAuthHeaders();

    console.log(`📥 共有Agentクローン開始: ${userId}/${agentId}`);

    const response = await fetch(`${baseUrl}/agents/shared-agents/${userId}/${agentId}/clone`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `共有Agentのクローンに失敗しました: ${response.status} ${response.statusText} - ${
          errorData.message || 'Unknown error'
        }`
      );
    }

    const data: AgentResponse = await response.json();
    console.log(`✅ 共有Agentクローン完了: ${data.agent.id}`);

    return {
      ...data.agent,
      createdAt: new Date(data.agent.createdAt),
      updatedAt: new Date(data.agent.updatedAt),
    };
  } catch (error) {
    console.error('💥 共有Agentクローンエラー:', error);
    throw error;
  }
}
