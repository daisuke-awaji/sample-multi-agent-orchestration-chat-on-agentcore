/**
 * Triggers API Client
 */

import { backendGet, backendPost, backendPut, backendDelete } from './client/backend-client';
import type {
  Trigger,
  CreateTriggerRequest,
  UpdateTriggerRequest,
  ListTriggersResponse,
  ListExecutionsResponse,
  ExecutionRecord,
} from '../types/trigger';

export interface TriggerResponse {
  trigger: Trigger;
  metadata: {
    requestId: string;
    timestamp: string;
    userId: string;
  };
}

export interface TriggersListResponse {
  triggers: Trigger[];
  nextToken?: string;
  metadata: {
    requestId: string;
    timestamp: string;
    userId: string;
    count: number;
  };
}

export interface ExecutionsListResponse {
  executions: ExecutionRecord[];
  nextToken?: string;
  metadata: {
    requestId: string;
    timestamp: string;
    count: number;
  };
}

export interface MessageResponse {
  message: string;
  metadata: {
    requestId: string;
    timestamp: string;
  };
}

/**
 * Parse trigger dates from API response
 */
function parseTriggerDates(trigger: Trigger): Trigger {
  return {
    ...trigger,
    createdAt: new Date(trigger.createdAt).toISOString(),
    updatedAt: new Date(trigger.updatedAt).toISOString(),
    lastExecutedAt: trigger.lastExecutedAt
      ? new Date(trigger.lastExecutedAt).toISOString()
      : undefined,
  };
}

/**
 * Parse execution record dates
 */
function parseExecutionDates(execution: ExecutionRecord): ExecutionRecord {
  return {
    ...execution,
    startTime: new Date(execution.startTime).toISOString(),
    endTime: execution.endTime ? new Date(execution.endTime).toISOString() : undefined,
  };
}

/**
 * Get list of user's triggers
 */
export async function listTriggers(
  type?: string,
  limit?: number,
  nextToken?: string
): Promise<ListTriggersResponse> {
  const params = new URLSearchParams();
  if (type) params.append('type', type);
  if (limit) params.append('limit', limit.toString());
  if (nextToken) params.append('nextToken', nextToken);

  const queryString = params.toString();
  const url = `/triggers${queryString ? `?${queryString}` : ''}`;

  const data = await backendGet<TriggersListResponse>(url);

  return {
    triggers: data.triggers.map(parseTriggerDates),
    nextToken: data.nextToken,
  };
}

/**
 * Get a specific trigger
 */
export async function getTrigger(triggerId: string): Promise<Trigger> {
  const data = await backendGet<TriggerResponse>(`/triggers/${triggerId}`);
  return parseTriggerDates(data.trigger);
}

/**
 * Create a new trigger
 */
export async function createTrigger(input: CreateTriggerRequest): Promise<Trigger> {
  const data = await backendPost<TriggerResponse>('/triggers', input);
  return parseTriggerDates(data.trigger);
}

/**
 * Update an existing trigger
 */
export async function updateTrigger(
  triggerId: string,
  input: UpdateTriggerRequest
): Promise<Trigger> {
  const data = await backendPut<TriggerResponse>(`/triggers/${triggerId}`, input);
  return parseTriggerDates(data.trigger);
}

/**
 * Delete a trigger
 */
export async function deleteTrigger(triggerId: string): Promise<void> {
  await backendDelete<void>(`/triggers/${triggerId}`);
}

/**
 * Enable a trigger
 */
export async function enableTrigger(triggerId: string): Promise<Trigger> {
  const data = await backendPost<TriggerResponse>(`/triggers/${triggerId}/enable`);
  return parseTriggerDates(data.trigger);
}

/**
 * Disable a trigger
 */
export async function disableTrigger(triggerId: string): Promise<Trigger> {
  const data = await backendPost<TriggerResponse>(`/triggers/${triggerId}/disable`);
  return parseTriggerDates(data.trigger);
}

/**
 * Get execution history for a trigger
 */
export async function getExecutionHistory(
  triggerId: string,
  limit?: number,
  nextToken?: string
): Promise<ListExecutionsResponse> {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit.toString());
  if (nextToken) params.append('nextToken', nextToken);

  const queryString = params.toString();
  const url = `/triggers/${triggerId}/executions${queryString ? `?${queryString}` : ''}`;

  const data = await backendGet<ExecutionsListResponse>(url);

  return {
    executions: data.executions.map(parseExecutionDates),
    nextToken: data.nextToken,
  };
}
