/**
 * Agent 関連の型定義
 */

/**
 * MCP server configuration
 */
export interface MCPServer {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  transport?: 'stdio' | 'http' | 'sse';
}

/**
 * MCP 設定
 */
export interface MCPConfig {
  mcpServers: Record<string, MCPServer>;
}

export interface Scenario {
  id: string;
  title: string; // Scenario name (e.g. "Code Review Request")
  prompt: string; // Prompt template
}

export interface Agent {
  agentId: string; // Agent ID (UUID or predefined ID like 'web-researcher')
  name: string; // Agent name
  description: string; // Description
  icon?: string; // Lucide icon name (e.g. "Bot", "Code", "Brain")
  systemPrompt: string; // System prompt
  enabledTools: string[]; // Array of enabled tool names
  scenarios: Scenario[]; // Frequently used prompts
  mcpConfig?: MCPConfig; // MCP server configuration
  createdAt: Date;
  updatedAt: Date;

  // 共有関連
  isShared: boolean; // Shared flag (public to organization)
  createdBy: string; // Creator name (Cognito username)
  userId?: string; // Original user ID (used when cloning shared agent)
}

/**
 * Create agent時の入力データ
 */
export interface CreateAgentInput {
  name: string;
  description: string;
  icon?: string;
  systemPrompt: string;
  enabledTools: string[];
  scenarios: Omit<Scenario, 'id'>[];
  mcpConfig?: MCPConfig;
}

/**
 * Update agent時の入力データ
 */
export interface UpdateAgentInput extends Partial<CreateAgentInput> {
  agentId: string;
}

/**
 * AgentStore の状態
 */
export interface AgentState {
  agents: Agent[];
  selectedAgent: Agent | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * AgentStore のアクション
 */
export interface AgentActions {
  // Agent CRUD (async)
  createAgent: (input: CreateAgentInput) => Promise<Agent>;
  updateAgent: (input: UpdateAgentInput) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
  getAgent: (id: string) => Agent | undefined;

  // Share agent
  toggleShare: (id: string) => Promise<Agent>;

  // Select agent
  selectAgent: (agent: Agent | null) => void;

  // 初期化・リセット (async)
  initializeStore: () => Promise<void>;
  clearError: () => void;
}

/**
 * AgentStore の完全な型
 */
export type AgentStore = AgentState & AgentActions;
