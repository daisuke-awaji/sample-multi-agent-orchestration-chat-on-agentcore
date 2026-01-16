/**
 * Trigger type definitions
 * These types define the data models for event-driven agent invocations
 */

/**
 * Trigger type - supports extensibility for future trigger sources
 */
export type TriggerType = 'schedule' | 'event';

/**
 * Trigger execution status
 */
export type TriggerExecutionStatus = 'running' | 'completed' | 'failed';

/**
 * Schedule configuration for schedule-type triggers
 */
export interface ScheduleTriggerConfig {
  /**
   * Cron expression (e.g., "cron(0 12 * * ? *)") or rate expression (e.g., "rate(1 hour)")
   */
  expression: string;

  /**
   * Timezone for cron expression (e.g., "Asia/Tokyo")
   * @default "UTC"
   */
  timezone?: string;

  /**
   * EventBridge Scheduler ARN
   */
  schedulerArn?: string;

  /**
   * EventBridge Scheduler Group Name
   */
  scheduleGroupName?: string;
}

/**
 * Event configuration for event-type triggers (future extension)
 */
export interface EventTriggerConfig {
  /**
   * EventBridge Bus name (e.g., "default", custom bus name)
   */
  eventBusName?: string;

  /**
   * EventBridge event pattern for filtering
   */
  eventPattern?: Record<string, unknown>;

  /**
   * EventBridge Rule ARN
   */
  ruleArn?: string;
}

/**
 * Main Trigger entity
 */
export interface Trigger {
  // DynamoDB Keys
  PK: string; // TRIGGER#{userId}
  SK: string; // TRIGGER#{triggerId}

  // Basic information
  id: string;
  userId: string;
  name: string;
  description?: string;
  type: TriggerType;
  enabled: boolean;

  // Agent invocation parameters
  agentId: string;
  prompt: string;
  sessionId?: string;
  modelId?: string;
  workingDirectory?: string;
  enabledTools?: string[];

  // Type-specific configuration
  scheduleConfig?: ScheduleTriggerConfig;
  eventConfig?: EventTriggerConfig;

  // Metadata
  createdAt: string;
  updatedAt: string;
  lastExecutedAt?: string;

  // GSI for listing by type
  GSI1PK?: string; // TYPE#{type}
  GSI1SK?: string; // USER#{userId}#{triggerId}
}

/**
 * Trigger execution history record
 */
export interface TriggerExecution {
  // DynamoDB Keys
  PK: string; // TRIGGER#{triggerId}
  SK: string; // EXECUTION#{executionId}

  triggerId: string;
  executionId: string;
  userId: string;

  startedAt: string;
  completedAt?: string;
  status: TriggerExecutionStatus;

  // Execution results
  requestId?: string;
  sessionId?: string;
  error?: string;

  // TTL for auto-cleanup (30 days)
  ttl: number;
}

/**
 * Request body for creating/updating triggers
 */
export interface CreateTriggerRequest {
  name: string;
  description?: string;
  type: TriggerType;
  agentId: string;
  prompt: string;
  sessionId?: string;
  modelId?: string;
  workingDirectory?: string;
  enabledTools?: string[];
  scheduleConfig?: Omit<ScheduleTriggerConfig, 'schedulerArn' | 'scheduleGroupName'>;
  eventConfig?: Omit<EventTriggerConfig, 'ruleArn'>;
}

/**
 * Request body for updating triggers
 */
export interface UpdateTriggerRequest extends Partial<CreateTriggerRequest> {
  enabled?: boolean;
}

/**
 * Response for trigger API
 */
export interface TriggerResponse {
  id: string;
  userId: string;
  name: string;
  description?: string;
  type: TriggerType;
  enabled: boolean;
  agentId: string;
  prompt: string;
  sessionId?: string;
  modelId?: string;
  workingDirectory?: string;
  enabledTools?: string[];
  scheduleConfig?: ScheduleTriggerConfig;
  eventConfig?: EventTriggerConfig;
  createdAt: string;
  updatedAt: string;
  lastExecutedAt?: string;
}

/**
 * Response for trigger execution history
 */
export interface TriggerExecutionResponse {
  triggerId: string;
  executionId: string;
  userId: string;
  startedAt: string;
  completedAt?: string;
  status: TriggerExecutionStatus;
  requestId?: string;
  sessionId?: string;
  error?: string;
}

/**
 * EventBridge Scheduler event payload
 */
export interface SchedulerEventPayload {
  triggerId: string;
  userId: string;
  agentId: string;
  prompt: string;
  sessionId?: string;
  modelId?: string;
  workingDirectory?: string;
  enabledTools?: string[];
}

/**
 * EventBridge Scheduler event structure
 * This is the event format sent by EventBridge Scheduler to Lambda
 */
export interface SchedulerEvent {
  version: string;
  id: string;
  'detail-type': string;
  source: string;
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: SchedulerEventPayload;
}

/**
 * EventBridge custom event payload (future)
 */
export interface CustomEventPayload {
  triggerId: string;
  userId: string;
  eventData: Record<string, unknown>;
}
