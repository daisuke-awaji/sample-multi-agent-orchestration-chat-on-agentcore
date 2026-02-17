/**
 * Triggers API endpoints
 * API for managing event-driven agent triggers
 */

import { Router, Response, NextFunction } from 'express';
import { jwtAuthMiddleware, AuthenticatedRequest, getCurrentAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { AppError } from '../middleware/error-handler.js';
import { getTriggersDynamoDBService } from '../services/triggers-dynamodb.js';
import { getSchedulerService } from '../services/scheduler-service.js';

const router = Router();

function requireUserId(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const auth = getCurrentAuth(req);
  if (!auth.userId) {
    return next(new AppError(400, 'Failed to retrieve user ID'));
  }
  next();
}

function requireTriggersService(_req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const triggersService = getTriggersDynamoDBService();
  if (!triggersService.isConfigured()) {
    return next(new AppError(500, 'Triggers Table is not configured'));
  }
  next();
}

const triggerMiddleware = [jwtAuthMiddleware, requireUserId, requireTriggersService];

function formatTriggerResponse(trigger: Record<string, unknown>) {
  return {
    id: trigger.id,
    name: trigger.name,
    description: trigger.description,
    type: trigger.type,
    enabled: trigger.enabled,
    agentId: trigger.agentId,
    prompt: trigger.prompt,
    sessionId: trigger.sessionId,
    modelId: trigger.modelId,
    workingDirectory: trigger.workingDirectory,
    enabledTools: trigger.enabledTools,
    scheduleConfig: trigger.scheduleConfig,
    eventConfig: trigger.eventConfig,
    createdAt: trigger.createdAt,
    updatedAt: trigger.updatedAt,
    lastExecutedAt: trigger.lastExecutedAt,
  };
}

/**
 * List all triggers for the authenticated user
 * GET /triggers
 */
router.get(
  '/',
  triggerMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const auth = getCurrentAuth(req);
    const userId = auth.userId!;

    console.log('📋 Triggers list retrieval started (%s):', auth.requestId, {
      userId,
      username: auth.username,
    });

    const triggersService = getTriggersDynamoDBService();
    const triggers = await triggersService.listTriggers(userId);

    console.log(
      `✅ Triggers list retrieval completed (${auth.requestId}): ${triggers.length} items`
    );

    res.status(200).json({
      triggers: triggers.map((trigger) =>
        formatTriggerResponse(trigger as unknown as Record<string, unknown>)
      ),
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
        count: triggers.length,
      },
    });
  })
);

/**
 * Get a specific trigger
 * GET /triggers/:id
 */
router.get(
  '/:id',
  triggerMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const auth = getCurrentAuth(req);
    const userId = auth.userId!;
    const { id: triggerId } = req.params;

    console.log('🔍 Trigger retrieval started (%s):', auth.requestId, {
      userId,
      triggerId,
    });

    const triggersService = getTriggersDynamoDBService();
    const trigger = await triggersService.getTrigger(userId, triggerId);

    if (!trigger) {
      console.warn('⚠️ Trigger not found (%s): %s', auth.requestId, triggerId);
      throw new AppError(404, 'Trigger not found');
    }

    console.log('✅ Trigger retrieval completed (%s)', auth.requestId);

    res.status(200).json({
      trigger: formatTriggerResponse(trigger as unknown as Record<string, unknown>),
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  })
);

/**
 * Create a new trigger
 * POST /triggers
 */
router.post(
  '/',
  triggerMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const auth = getCurrentAuth(req);
    const userId = auth.userId!;

    const {
      name,
      description,
      type,
      agentId,
      prompt,
      sessionId,
      modelId,
      workingDirectory,
      enabledTools,
      scheduleConfig,
      eventConfig,
    } = req.body;

    if (!name || !type || !agentId || !prompt) {
      throw new AppError(400, 'Required fields: name, type, agentId, prompt');
    }

    if (type === 'schedule' && !scheduleConfig?.expression) {
      throw new AppError(
        400,
        'scheduleConfig.expression is required for schedule type triggers'
      );
    }

    console.log('✨ Trigger creation started (%s):', auth.requestId, {
      userId,
      name,
      type,
      agentId,
    });

    const triggersService = getTriggersDynamoDBService();

    const trigger = await triggersService.createTrigger({
      userId,
      name,
      description,
      type,
      agentId,
      prompt,
      sessionId,
      modelId,
      workingDirectory,
      enabledTools,
      scheduleConfig,
      eventConfig,
    });

    if (type === 'schedule' && scheduleConfig) {
      try {
        const schedulerService = getSchedulerService();
        const targetArn = process.env.TRIGGER_LAMBDA_ARN;
        const roleArn = process.env.SCHEDULER_ROLE_ARN;

        if (!targetArn || !roleArn) {
          throw new Error('TRIGGER_LAMBDA_ARN or SCHEDULER_ROLE_ARN not configured');
        }

        const schedulerArn = await schedulerService.createSchedule({
          name: `trigger-${trigger.id}`,
          expression: scheduleConfig.expression,
          timezone: scheduleConfig.timezone,
          payload: {
            triggerId: trigger.id,
            userId,
            agentId,
            prompt,
            sessionId,
            modelId,
            workingDirectory,
            enabledTools,
          },
          targetArn,
          roleArn,
        });

        await triggersService.updateTrigger(userId, trigger.id, {
          scheduleConfig: {
            ...scheduleConfig,
            schedulerArn,
            scheduleGroupName: 'default',
          },
        });

        console.log(`✅ EventBridge Schedule created: ${schedulerArn}`);
      } catch (scheduleError) {
        console.error('Failed to create EventBridge Schedule:', scheduleError);
        await triggersService.deleteTrigger(userId, trigger.id);
        throw new Error(
          `Failed to create schedule: ${scheduleError instanceof Error ? scheduleError.message : String(scheduleError)}`
        );
      }
    }

    console.log('✅ Trigger created successfully (%s): %s', auth.requestId, trigger.id);

    res.status(201).json({
      trigger: formatTriggerResponse(trigger as unknown as Record<string, unknown>),
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  })
);

/**
 * Update a trigger
 * PUT /triggers/:id
 */
router.put(
  '/:id',
  triggerMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const auth = getCurrentAuth(req);
    const userId = auth.userId!;
    const { id: triggerId } = req.params;

    console.log('✏️ Trigger update started (%s):', auth.requestId, {
      userId,
      triggerId,
    });

    const triggersService = getTriggersDynamoDBService();

    const existingTrigger = await triggersService.getTrigger(userId, triggerId);
    if (!existingTrigger) {
      throw new AppError(404, 'Trigger not found');
    }

    const {
      name,
      description,
      type,
      agentId,
      prompt,
      sessionId,
      modelId,
      workingDirectory,
      enabledTools,
      scheduleConfig,
      eventConfig,
    } = req.body;

    const typeChanged = type && type !== existingTrigger.type;

    if (typeChanged && existingTrigger.type === 'schedule' && type === 'event') {
      console.log('🔄 Type change detected: schedule -> event (%s)', auth.requestId);

      try {
        const schedulerService = getSchedulerService();
        await schedulerService.deleteSchedule(triggerId);
        console.log(`✅ EventBridge Schedule deleted for type change`);
      } catch (scheduleError) {
        console.warn('Failed to delete EventBridge Schedule during type change:', scheduleError);
      }
    }

    if (typeChanged && existingTrigger.type === 'event' && type === 'schedule') {
      console.log('🔄 Type change detected: event -> schedule (%s)', auth.requestId);

      if (!scheduleConfig?.expression) {
        throw new AppError(
          400,
          'scheduleConfig.expression is required when changing to schedule type'
        );
      }

      try {
        const schedulerService = getSchedulerService();
        const targetArn = process.env.TRIGGER_LAMBDA_ARN;
        const roleArn = process.env.SCHEDULER_ROLE_ARN;

        if (!targetArn || !roleArn) {
          throw new Error('TRIGGER_LAMBDA_ARN or SCHEDULER_ROLE_ARN not configured');
        }

        const schedulerArn = await schedulerService.createSchedule({
          name: `trigger-${triggerId}`,
          expression: scheduleConfig.expression,
          timezone: scheduleConfig.timezone,
          payload: {
            triggerId,
            userId,
            agentId: agentId || existingTrigger.agentId,
            prompt: prompt || existingTrigger.prompt,
            sessionId: sessionId !== undefined ? sessionId : existingTrigger.sessionId,
            modelId: modelId !== undefined ? modelId : existingTrigger.modelId,
            workingDirectory:
              workingDirectory !== undefined ? workingDirectory : existingTrigger.workingDirectory,
            enabledTools: enabledTools || existingTrigger.enabledTools,
          },
          targetArn,
          roleArn,
        });

        console.log(`✅ EventBridge Schedule created for type change: ${schedulerArn}`);
      } catch (scheduleError) {
        console.error('Failed to create EventBridge Schedule during type change:', scheduleError);
        throw new Error(
          `Failed to create schedule: ${scheduleError instanceof Error ? scheduleError.message : String(scheduleError)}`
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (type !== undefined) updateData.type = type;
    if (agentId !== undefined) updateData.agentId = agentId;
    if (prompt !== undefined) updateData.prompt = prompt;
    if (sessionId !== undefined) updateData.sessionId = sessionId;
    if (modelId !== undefined) updateData.modelId = modelId;
    if (workingDirectory !== undefined) updateData.workingDirectory = workingDirectory;
    if (enabledTools !== undefined) updateData.enabledTools = enabledTools;
    if (scheduleConfig !== undefined) updateData.scheduleConfig = scheduleConfig;
    if (eventConfig !== undefined) updateData.eventConfig = eventConfig;

    const updatedTrigger = await triggersService.updateTrigger(userId, triggerId, updateData);

    if (updatedTrigger.type === 'schedule' && !typeChanged && scheduleConfig) {
      try {
        const schedulerService = getSchedulerService();
        const targetArn = process.env.TRIGGER_LAMBDA_ARN;
        const roleArn = process.env.SCHEDULER_ROLE_ARN;

        if (targetArn && roleArn) {
          await schedulerService.updateSchedule(triggerId, {
            expression: scheduleConfig.expression,
            timezone: scheduleConfig.timezone,
            payload: {
              triggerId,
              userId,
              agentId: agentId || existingTrigger.agentId,
              prompt: prompt || existingTrigger.prompt,
              sessionId: sessionId !== undefined ? sessionId : existingTrigger.sessionId,
              modelId: modelId !== undefined ? modelId : existingTrigger.modelId,
              workingDirectory:
                workingDirectory !== undefined
                  ? workingDirectory
                  : existingTrigger.workingDirectory,
              enabledTools: enabledTools || existingTrigger.enabledTools,
            },
            targetArn,
            roleArn,
          });
        }
      } catch (scheduleError) {
        console.warn('Failed to update EventBridge Schedule (non-critical):', scheduleError);
      }
    }

    console.log('✅ Trigger updated successfully (%s)', auth.requestId);

    res.status(200).json({
      trigger: formatTriggerResponse(updatedTrigger as unknown as Record<string, unknown>),
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  })
);

/**
 * Delete a trigger
 * DELETE /triggers/:id
 */
router.delete(
  '/:id',
  triggerMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const auth = getCurrentAuth(req);
    const userId = auth.userId!;
    const { id: triggerId } = req.params;

    console.log('🗑️ Trigger deletion started (%s):', auth.requestId, {
      userId,
      triggerId,
    });

    const triggersService = getTriggersDynamoDBService();

    const trigger = await triggersService.getTrigger(userId, triggerId);
    if (!trigger) {
      throw new AppError(404, 'Trigger not found');
    }

    if (trigger.type === 'schedule') {
      try {
        const schedulerService = getSchedulerService();
        await schedulerService.deleteSchedule(triggerId);
        console.log(`✅ EventBridge Schedule deleted`);
      } catch (scheduleError) {
        console.warn(
          'Failed to delete EventBridge Schedule (continuing with trigger deletion):',
          scheduleError
        );
      }
    }

    await triggersService.deleteTrigger(userId, triggerId);

    console.log('✅ Trigger deleted successfully (%s)', auth.requestId);

    res.status(200).json({
      success: true,
      message: 'Trigger deleted',
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
        triggerId,
      },
    });
  })
);

/**
 * Enable a trigger
 * POST /triggers/:id/enable
 */
router.post(
  '/:id/enable',
  triggerMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const auth = getCurrentAuth(req);
    const userId = auth.userId!;
    const { id: triggerId } = req.params;

    console.log('▶️ Trigger enable started (%s):', auth.requestId, {
      userId,
      triggerId,
    });

    const triggersService = getTriggersDynamoDBService();

    const trigger = await triggersService.getTrigger(userId, triggerId);
    if (!trigger) {
      throw new AppError(404, 'Trigger not found');
    }

    const updatedTrigger = await triggersService.updateTrigger(userId, triggerId, {
      enabled: true,
    });

    if (trigger.type === 'schedule') {
      try {
        const schedulerService = getSchedulerService();
        await schedulerService.enableSchedule(triggerId);
      } catch (scheduleError) {
        console.error('Failed to enable EventBridge Schedule:', scheduleError);
        throw new Error(
          `Failed to enable schedule: ${scheduleError instanceof Error ? scheduleError.message : String(scheduleError)}`
        );
      }
    }

    console.log('✅ Trigger enabled successfully (%s)', auth.requestId);

    res.status(200).json({
      trigger: formatTriggerResponse(updatedTrigger as unknown as Record<string, unknown>),
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  })
);

/**
 * Disable a trigger
 * POST /triggers/:id/disable
 */
router.post(
  '/:id/disable',
  triggerMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const auth = getCurrentAuth(req);
    const userId = auth.userId!;
    const { id: triggerId } = req.params;

    console.log('⏸️ Trigger disable started (%s):', auth.requestId, {
      userId,
      triggerId,
    });

    const triggersService = getTriggersDynamoDBService();

    const trigger = await triggersService.getTrigger(userId, triggerId);
    if (!trigger) {
      throw new AppError(404, 'Trigger not found');
    }

    const updatedTrigger = await triggersService.updateTrigger(userId, triggerId, {
      enabled: false,
    });

    if (trigger.type === 'schedule') {
      try {
        const schedulerService = getSchedulerService();
        await schedulerService.disableSchedule(triggerId);
      } catch (scheduleError) {
        console.error('Failed to disable EventBridge Schedule:', scheduleError);
        throw new Error(
          `Failed to disable schedule: ${scheduleError instanceof Error ? scheduleError.message : String(scheduleError)}`
        );
      }
    }

    console.log('✅ Trigger disabled successfully (%s)', auth.requestId);

    res.status(200).json({
      trigger: formatTriggerResponse(updatedTrigger as unknown as Record<string, unknown>),
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  })
);

/**
 * Get execution history for a trigger
 * GET /triggers/:id/executions
 */
router.get(
  '/:id/executions',
  triggerMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const auth = getCurrentAuth(req);
    const userId = auth.userId!;
    const { id: triggerId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const nextToken = req.query.nextToken as string | undefined;

    console.log('📊 Execution history retrieval started (%s):', auth.requestId, {
      userId,
      triggerId,
      limit,
      hasNextToken: !!nextToken,
    });

    const triggersService = getTriggersDynamoDBService();

    const trigger = await triggersService.getTrigger(userId, triggerId);
    if (!trigger) {
      throw new AppError(404, 'Trigger not found');
    }

    let exclusiveStartKey: Record<string, unknown> | undefined;
    if (nextToken) {
      try {
        exclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8'));
      } catch {
        throw new AppError(400, 'Invalid nextToken format');
      }
    }

    const result = await triggersService.getExecutions(triggerId, limit, exclusiveStartKey);

    const responseNextToken = result.lastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64')
      : undefined;

    console.log(
      `✅ Execution history retrieval completed (${auth.requestId}): ${result.executions.length} items, hasMore: ${!!responseNextToken}`
    );

    res.status(200).json({
      executions: result.executions.map((execution) => ({
        executionId: execution.executionId,
        triggerId: execution.triggerId,
        startTime: execution.startedAt,
        endTime: execution.completedAt,
        status: execution.status,
        requestId: execution.requestId,
        sessionId: execution.sessionId,
        error: execution.error,
      })),
      nextToken: responseNextToken,
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
        triggerId,
        count: result.executions.length,
      },
    });
  })
);

export default router;
