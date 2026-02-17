/**
 * Agent Registry
 * Fetches agent definitions from backend API
 */

import { logger } from '../config/index.js';
import { getCurrentAuthHeader } from '../context/request-context.js';

/**
 * Agent definition structure
 */
export interface AgentDefinition {
  name: string;
  systemPrompt: string;
  enabledTools: string[];
  modelId?: string;
}

/**
 * Backend API response types
 */
interface BackendAgent {
  agentId: string;
  name: string;
  description: string;
  systemPrompt?: string;
  enabledTools?: string[];
  modelId?: string;
}

interface GetAgentResponse {
  agent: BackendAgent;
  metadata?: Record<string, unknown>;
}

interface ListAgentsResponse {
  agents: BackendAgent[];
  metadata?: Record<string, unknown>;
}

/**
 * Cache for agent definitions
 */
const agentCache = new Map<string, AgentDefinition>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

/**
 * Get backend API URL
 */
function getBackendApiUrl(): string {
  // Check for backend URL in environment
  const backendUrl = process.env.BACKEND_API_URL;

  if (backendUrl) {
    return backendUrl;
  }

  // Fallback to localhost for development
  return 'http://localhost:3000';
}

/**
 * Options for Backend API calls
 * Used to pass auth context explicitly when AsyncLocalStorage context is unavailable
 * (e.g., background sub-agent task execution)
 */
export interface AgentRegistryOptions {
  /** Authorization header (Bearer token) — overrides AsyncLocalStorage context */
  authHeader?: string;
  /** User ID for Machine User requests — sent as X-Target-User-Id header */
  userId?: string;
}

/**
 * Build request headers for Backend API calls
 * Resolves auth header from explicit options or AsyncLocalStorage context
 */
function buildHeaders(options?: AgentRegistryOptions): Record<string, string> {
  const authHeader = options?.authHeader || getCurrentAuthHeader();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }
  if (options?.userId) {
    headers['X-Target-User-Id'] = options.userId;
  }
  return headers;
}

/**
 * Fetch agent definition from backend API by agentId
 */
export async function getAgentDefinition(
  agentId: string,
  options?: AgentRegistryOptions
): Promise<AgentDefinition | null> {
  // Check cache
  const cached = agentCache.get(agentId);
  const cacheTime = cacheTimestamps.get(agentId);

  if (cached && cacheTime && Date.now() - cacheTime < CACHE_TTL) {
    logger.info('📦 Using cached agent definition:', { agentId });
    return cached;
  }

  try {
    const backendUrl = getBackendApiUrl();
    // Use agentId directly - backend expects agentId parameter
    const url = `${backendUrl}/agents/${encodeURIComponent(agentId)}`;

    const headers = buildHeaders(options);

    logger.info('🔍 Fetching agent definition:', {
      agentId,
      url,
      hasAuth: !!headers['Authorization'],
      hasTargetUserId: !!headers['X-Target-User-Id'],
    });

    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        logger.warn('⚠️ Agent not found:', { agentId });
        return null;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as GetAgentResponse | BackendAgent;

    // Extract agent from response (backend returns { agent: {...}, metadata: {...} })
    const agent = 'agent' in data ? data.agent : data;

    if (!agent) {
      logger.warn('⚠️ Agent not found in response:', { agentId });
      return null;
    }

    // Map backend agent structure to AgentDefinition
    const definition: AgentDefinition = {
      name: agent.name,
      systemPrompt: agent.systemPrompt || '',
      enabledTools: agent.enabledTools || [],
      modelId: agent.modelId,
    };

    // Cache the result
    agentCache.set(agentId, definition);
    cacheTimestamps.set(agentId, Date.now());

    logger.info('✅ Agent definition fetched and cached:', {
      agentId,
      tools: definition.enabledTools.length,
    });

    return definition;
  } catch (error) {
    logger.error('❌ Failed to fetch agent definition:', {
      agentId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * List all available agents with simplified information
 */
export async function listAgents(
  options?: AgentRegistryOptions
): Promise<Array<{ agentId: string; name: string; description: string }>> {
  try {
    const backendUrl = getBackendApiUrl();
    const url = `${backendUrl}/agents`;

    const headers = buildHeaders(options);

    logger.info('🔍 Fetching agent list:', {
      url,
      hasAuth: !!headers['Authorization'],
      hasTargetUserId: !!headers['X-Target-User-Id'],
    });

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as ListAgentsResponse;

    // Backend returns { agents: [...], metadata: {...} }
    const agents = data.agents || [];

    return agents.map((agent) => ({
      agentId: agent.agentId,
      name: agent.name,
      description: agent.description,
    }));
  } catch (error) {
    logger.error('❌ Failed to list agents:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return [];
  }
}

/**
 * Clear agent cache
 */
export function clearCache(): void {
  agentCache.clear();
  cacheTimestamps.clear();
  logger.info('🧹 Agent cache cleared');
}
