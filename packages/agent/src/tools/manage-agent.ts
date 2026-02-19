/**
 * Manage Agent Tool
 * Create, update, or retrieve AI agent configurations
 */

import { tool } from '@strands-agents/sdk';
import { logger } from '../config/index.js';
import { getCurrentContext, getCurrentAuthHeader } from '../context/request-context.js';
import { manageAgentDefinition } from '@moca/tool-definitions';

/**
 * Get backend API URL
 */
function getBackendApiUrl(): string {
  const backendUrl = process.env.BACKEND_API_URL;
  if (backendUrl) {
    return backendUrl;
  }
  return 'http://localhost:3000';
}

/**
 * Backend API response type
 */
interface AgentResponse {
  agent: {
    agentId: string;
    name: string;
    description: string;
    systemPrompt: string;
    enabledTools: string[];
    icon?: string;
    scenarios?: Array<{ id: string; title: string; prompt: string }>;
    createdAt: string;
    updatedAt: string;
  };
  metadata: {
    requestId: string;
    timestamp: string;
    userId: string;
  };
}

/**
 * Handle create action
 */
async function handleCreate(
  input: {
    name?: string;
    description?: string;
    systemPrompt?: string;
    enabledTools?: string[];
    icon?: string;
    scenarios?: Array<{ title: string; prompt: string }>;
  },
  authHeader: string
): Promise<string> {
  const { name, description, systemPrompt, enabledTools, icon, scenarios } = input;

  // Validate required fields for create
  if (!name || !description || !systemPrompt || !enabledTools) {
    return JSON.stringify({
      success: false,
      error: 'Missing required parameters for create action',
      message: 'name, description, systemPrompt, and enabledTools are required',
    });
  }

  const currentContext = getCurrentContext();
  const backendUrl = getBackendApiUrl();
  const url = `${backendUrl}/agents`;

  logger.info('📤 Creating agent via backend API:', {
    url,
    agentName: name,
    userId: currentContext?.userId,
  });

  const requestBody = {
    name,
    description,
    systemPrompt,
    enabledTools,
    icon,
    scenarios: scenarios || [],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('❌ Failed to create agent:', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    });

    return JSON.stringify({
      success: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
      message: errorText,
    });
  }

  const data = (await response.json()) as AgentResponse;

  logger.info('✅ Agent created successfully:', {
    agentId: data.agent.agentId,
    name: data.agent.name,
  });

  return JSON.stringify({
    success: true,
    agentId: data.agent.agentId,
    name: data.agent.name,
    description: data.agent.description,
    enabledTools: data.agent.enabledTools,
    icon: data.agent.icon,
    createdAt: data.agent.createdAt,
    message: `Agent "${data.agent.name}" created successfully with ID: ${data.agent.agentId}`,
  });
}

/**
 * Handle update action
 */
async function handleUpdate(
  input: {
    agentId?: string;
    name?: string;
    description?: string;
    systemPrompt?: string;
    enabledTools?: string[];
    icon?: string;
    scenarios?: Array<{ title: string; prompt: string }>;
  },
  authHeader: string
): Promise<string> {
  const { agentId, name, description, systemPrompt, enabledTools, icon, scenarios } = input;

  // Validate agentId for update
  if (!agentId) {
    return JSON.stringify({
      success: false,
      error: 'Missing required parameter for update action',
      message: 'agentId is required for update action',
    });
  }

  // Build update payload with only provided fields
  const updatePayload: Record<string, unknown> = {};
  if (name !== undefined) updatePayload.name = name;
  if (description !== undefined) updatePayload.description = description;
  if (systemPrompt !== undefined) updatePayload.systemPrompt = systemPrompt;
  if (enabledTools !== undefined) updatePayload.enabledTools = enabledTools;
  if (icon !== undefined) updatePayload.icon = icon;
  if (scenarios !== undefined) updatePayload.scenarios = scenarios;

  if (Object.keys(updatePayload).length === 0) {
    return JSON.stringify({
      success: false,
      error: 'No fields to update',
      message:
        'At least one field (name, description, systemPrompt, enabledTools, icon, scenarios) must be provided',
    });
  }

  const currentContext = getCurrentContext();
  const backendUrl = getBackendApiUrl();
  const url = `${backendUrl}/agents/${agentId}`;

  logger.info('📤 Updating agent via backend API:', {
    url,
    agentId,
    updateFields: Object.keys(updatePayload),
    userId: currentContext?.userId,
  });

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updatePayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('❌ Failed to update agent:', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    });

    return JSON.stringify({
      success: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
      message: errorText,
    });
  }

  const data = (await response.json()) as AgentResponse;

  logger.info('✅ Agent updated successfully:', {
    agentId: data.agent.agentId,
    name: data.agent.name,
  });

  return JSON.stringify({
    success: true,
    agentId: data.agent.agentId,
    name: data.agent.name,
    description: data.agent.description,
    enabledTools: data.agent.enabledTools,
    icon: data.agent.icon,
    updatedAt: data.agent.updatedAt,
    message: `Agent "${data.agent.name}" updated successfully`,
  });
}

/**
 * Handle get action
 */
async function handleGet(input: { agentId?: string }, authHeader: string): Promise<string> {
  const { agentId } = input;

  // Validate agentId for get
  if (!agentId) {
    return JSON.stringify({
      success: false,
      error: 'Missing required parameter for get action',
      message: 'agentId is required for get action',
    });
  }

  const currentContext = getCurrentContext();
  const backendUrl = getBackendApiUrl();
  const url = `${backendUrl}/agents/${agentId}`;

  logger.info('📤 Getting agent via backend API:', {
    url,
    agentId,
    userId: currentContext?.userId,
  });

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('❌ Failed to get agent:', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    });

    return JSON.stringify({
      success: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
      message: errorText,
    });
  }

  const data = (await response.json()) as AgentResponse;

  logger.info('✅ Agent retrieved successfully:', {
    agentId: data.agent.agentId,
    name: data.agent.name,
  });

  return JSON.stringify({
    success: true,
    agent: {
      agentId: data.agent.agentId,
      name: data.agent.name,
      description: data.agent.description,
      systemPrompt: data.agent.systemPrompt,
      enabledTools: data.agent.enabledTools,
      icon: data.agent.icon,
      scenarios: data.agent.scenarios,
      createdAt: data.agent.createdAt,
      updatedAt: data.agent.updatedAt,
    },
  });
}

/**
 * Manage Agent Tool Implementation
 */
export const manageAgentTool = tool({
  name: manageAgentDefinition.name,
  description: manageAgentDefinition.description,
  inputSchema: manageAgentDefinition.zodSchema,
  callback: async (input) => {
    const { action } = input;

    logger.info('🤖 manage_agent tool called:', {
      action,
      agentId: input.agentId,
    });

    // Get auth header from request context
    const authHeader = getCurrentAuthHeader();
    if (!authHeader) {
      return JSON.stringify({
        success: false,
        error: 'Authentication required',
        message: 'No authentication token available. Cannot manage agent.',
      });
    }

    try {
      switch (action) {
        case 'create':
          return await handleCreate(input, authHeader);
        case 'update':
          return await handleUpdate(input, authHeader);
        case 'get':
          return await handleGet(input, authHeader);
        default:
          return JSON.stringify({
            success: false,
            error: 'Invalid action',
            message: `Unknown action: ${action}. Valid actions are: create, update, get`,
          });
      }
    } catch (error) {
      logger.error('❌ Error in manage_agent tool:', {
        action,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return JSON.stringify({
        success: false,
        error: 'Operation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});
