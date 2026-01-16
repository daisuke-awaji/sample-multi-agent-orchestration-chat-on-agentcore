/**
 * Trigger types for frontend
 */

export type TriggerType = 'schedule' | 'event';
export type TriggerStatus = 'enabled' | 'disabled';

export interface Trigger {
  id: string;
  userId: string;
  name: string;
  description?: string;
  agentId: string;
  type: TriggerType;
  enabled: boolean;
  prompt: string;
  sessionId?: string;
  modelId?: string;
  workingDirectory?: string;
  enabledTools?: string[];
  scheduleConfig?: ScheduleConfig;
  eventConfig?: EventConfig;
  createdAt: string;
  updatedAt: string;
  lastExecutedAt?: string;
}

export interface ScheduleConfig {
  expression: string;
  timezone?: string;
  schedulerArn?: string;
  scheduleGroupName?: string;
}

export interface EventConfig {
  eventSource: string;
  eventPattern: Record<string, unknown>;
}

export interface ExecutionRecord {
  executionId: string;
  triggerId: string;
  status: 'success' | 'failure' | 'in_progress';
  startTime: string;
  endTime?: string;
  duration?: number;
  input?: string;
  output?: string;
  error?: string;
}

export interface CreateTriggerRequest {
  name: string;
  description?: string;
  agentId: string;
  type: TriggerType;
  prompt: string;
  sessionId?: string;
  modelId?: string;
  workingDirectory?: string;
  enabledTools?: string[];
  scheduleConfig?: ScheduleConfig;
  eventConfig?: EventConfig;
}

export interface UpdateTriggerRequest {
  name?: string;
  description?: string;
  agentId?: string;
  prompt?: string;
  sessionId?: string;
  modelId?: string;
  workingDirectory?: string;
  enabledTools?: string[];
  scheduleConfig?: ScheduleConfig;
}

export interface ListTriggersResponse {
  triggers: Trigger[];
  nextToken?: string;
}

export interface ListExecutionsResponse {
  executions: ExecutionRecord[];
  nextToken?: string;
}
