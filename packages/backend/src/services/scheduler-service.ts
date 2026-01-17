/**
 * EventBridge Scheduler Service
 * Manages EventBridge Schedules for trigger automation
 */

import {
  SchedulerClient,
  CreateScheduleCommand,
  UpdateScheduleCommand,
  DeleteScheduleCommand,
  GetScheduleCommand,
} from '@aws-sdk/client-scheduler';

/**
 * Schedule payload for Lambda invocation
 */
export interface SchedulePayload {
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
 * Schedule configuration
 */
export interface ScheduleConfig {
  name: string;
  expression: string;
  timezone?: string;
  payload: SchedulePayload;
  targetArn: string;
  roleArn: string;
  enabled?: boolean;
}

/**
 * Format schedule expression for EventBridge Scheduler
 * Wraps cron expressions with cron() and passes through rate expressions
 */
function formatScheduleExpression(expression: string): string {
  const trimmed = expression.trim();

  // If already wrapped, return as-is
  if (trimmed.startsWith('cron(') || trimmed.startsWith('rate(')) {
    return trimmed;
  }

  // If starts with 'rate', wrap with rate()
  if (trimmed.startsWith('rate ')) {
    return `rate(${trimmed.substring(5)})`;
  }

  // Otherwise, treat as cron expression
  return `cron(${trimmed})`;
}

/**
 * EventBridge Scheduler Service
 */
export class SchedulerService {
  private readonly client: SchedulerClient;
  private readonly scheduleGroupName: string;

  constructor(region?: string, scheduleGroupName: string = 'default') {
    this.client = new SchedulerClient({
      region: region || process.env.AWS_REGION || 'us-east-1',
    });
    this.scheduleGroupName = scheduleGroupName;
  }

  /**
   * Create a new schedule
   */
  async createSchedule(config: ScheduleConfig): Promise<string> {
    const scheduleName = `trigger-${config.payload.triggerId}`;

    console.log('Creating EventBridge Schedule:', {
      name: scheduleName,
      expression: config.expression,
      timezone: config.timezone,
      triggerId: config.payload.triggerId,
    });

    try {
      const command = new CreateScheduleCommand({
        Name: scheduleName,
        GroupName: this.scheduleGroupName,
        ScheduleExpression: formatScheduleExpression(config.expression),
        ScheduleExpressionTimezone: config.timezone || 'UTC',
        State: config.enabled === false ? 'DISABLED' : 'ENABLED',
        FlexibleTimeWindow: {
          Mode: 'OFF',
        },
        Target: {
          Arn: config.targetArn,
          RoleArn: config.roleArn,
          Input: JSON.stringify({
            version: '0',
            id: `trigger-${config.payload.triggerId}`,
            'detail-type': 'Scheduled Event',
            source: 'agentcore.trigger',
            time: new Date().toISOString(),
            region: process.env.AWS_REGION || 'us-east-1',
            resources: [],
            detail: config.payload,
          }),
        },
      });

      await this.client.send(command);

      const scheduleArn = `arn:aws:scheduler:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:schedule/${this.scheduleGroupName}/${scheduleName}`;

      console.log('Schedule created successfully:', {
        name: scheduleName,
        arn: scheduleArn,
      });

      return scheduleArn;
    } catch (error) {
      console.error('Failed to create schedule:', error);
      throw new Error(
        `Failed to create EventBridge schedule: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Update an existing schedule
   */
  async updateSchedule(triggerId: string, config: Partial<ScheduleConfig>): Promise<void> {
    const scheduleName = `trigger-${triggerId}`;

    console.log('Updating EventBridge Schedule:', {
      name: scheduleName,
      expression: config.expression,
      timezone: config.timezone,
    });

    try {
      // Get current schedule to merge with updates
      const getCommand = new GetScheduleCommand({
        Name: scheduleName,
        GroupName: this.scheduleGroupName,
      });
      const currentSchedule = await this.client.send(getCommand);

      const command = new UpdateScheduleCommand({
        Name: scheduleName,
        GroupName: this.scheduleGroupName,
        ScheduleExpression: config.expression
          ? formatScheduleExpression(config.expression)
          : currentSchedule.ScheduleExpression,
        ScheduleExpressionTimezone:
          config.timezone || currentSchedule.ScheduleExpressionTimezone || 'UTC',
        State:
          config.enabled === false
            ? 'DISABLED'
            : config.enabled === true
              ? 'ENABLED'
              : currentSchedule.State,
        FlexibleTimeWindow: {
          Mode: 'OFF',
        },
        Target: config.payload
          ? {
              Arn: config.targetArn || currentSchedule.Target!.Arn,
              RoleArn: config.roleArn || currentSchedule.Target!.RoleArn,
              Input: JSON.stringify({
                version: '0',
                id: `trigger-${triggerId}`,
                'detail-type': 'Scheduled Event',
                source: 'agentcore.trigger',
                time: new Date().toISOString(),
                region: process.env.AWS_REGION || 'us-east-1',
                resources: [],
                detail: config.payload,
              }),
            }
          : currentSchedule.Target,
      });

      await this.client.send(command);

      console.log('Schedule updated successfully:', { name: scheduleName });
    } catch (error) {
      console.error('Failed to update schedule:', error);
      throw new Error(
        `Failed to update EventBridge schedule: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Delete a schedule
   */
  async deleteSchedule(triggerId: string): Promise<void> {
    const scheduleName = `trigger-${triggerId}`;

    console.log('Deleting EventBridge Schedule:', { name: scheduleName });

    try {
      const command = new DeleteScheduleCommand({
        Name: scheduleName,
        GroupName: this.scheduleGroupName,
      });

      await this.client.send(command);

      console.log('Schedule deleted successfully:', { name: scheduleName });
    } catch (error) {
      console.error('Failed to delete schedule:', error);
      throw new Error(
        `Failed to delete EventBridge schedule: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Enable a schedule
   */
  async enableSchedule(triggerId: string): Promise<void> {
    await this.updateSchedule(triggerId, { enabled: true });
    console.log('Schedule enabled:', { triggerId });
  }

  /**
   * Disable a schedule
   */
  async disableSchedule(triggerId: string): Promise<void> {
    await this.updateSchedule(triggerId, { enabled: false });
    console.log('Schedule disabled:', { triggerId });
  }

  /**
   * Check if a schedule exists
   */
  async scheduleExists(triggerId: string): Promise<boolean> {
    const scheduleName = `trigger-${triggerId}`;

    try {
      const command = new GetScheduleCommand({
        Name: scheduleName,
        GroupName: this.scheduleGroupName,
      });

      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        return false;
      }
      throw error;
    }
  }
}

// Singleton instance
let schedulerServiceInstance: SchedulerService | null = null;

/**
 * Get or create SchedulerService instance
 */
export function getSchedulerService(): SchedulerService {
  if (!schedulerServiceInstance) {
    const region = process.env.AWS_REGION;
    const scheduleGroupName = process.env.SCHEDULE_GROUP_NAME || 'default';
    schedulerServiceInstance = new SchedulerService(region, scheduleGroupName);
  }
  return schedulerServiceInstance;
}
