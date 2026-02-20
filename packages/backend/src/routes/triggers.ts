/**
 * Triggers API endpoints
 * API for managing event-driven agent triggers
 */

import { Router, Response } from 'express';
import { jwtAuthMiddleware, AuthenticatedRequest, getCurrentAuth } from '../middleware/auth.js';
import { getTriggersDynamoDBService } from '../services/triggers-dynamodb.js';
import { getSchedulerService } from '../services/scheduler-service.js';

const router = Router();

/**
 * List all triggers for the authenticated user
 * GET /triggers
 */
router.get('/', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'Failed to retrieve user ID',
        requestId: auth.requestId,
      });
    }

    console.log('📋 Triggers list retrieval started (%s):', auth.requestId, {
      userId,
      username: auth.username,
    });

    const triggersService = getTriggersDynamoDBService();

    if (!triggersService.isConfigured()) {
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'Triggers Table is not configured',
        requestId: auth.requestId,
      });
    }

    const triggers = await triggersService.listTriggers(userId);

    console.log(
      `✅ Triggers list retrieval completed (${auth.requestId}): ${triggers.length} items`
    );

    res.status(200).json({
      triggers: triggers.map((trigger) => ({
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
      })),
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
        count: triggers.length,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error('💥 Triggers list retrieval error (%s):', auth.requestId, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to retrieve triggers list',
      requestId: auth.requestId,
    });
  }
});

/**
 * Get a specific trigger
 * GET /triggers/:id
 */
router.get('/:id', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;
    const { id: triggerId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'Failed to retrieve user ID',
        requestId: auth.requestId,
      });
    }

    console.log('🔍 Trigger retrieval started (%s):', auth.requestId, {
      userId,
      triggerId,
    });

    const triggersService = getTriggersDynamoDBService();

    if (!triggersService.isConfigured()) {
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'Triggers Table is not configured',
        requestId: auth.requestId,
      });
    }

    const trigger = await triggersService.getTrigger(userId, triggerId);

    if (!trigger) {
      console.warn('⚠️ Trigger not found (%s): ${triggerId}', auth.requestId);
      return res.status(404).json({
        error: 'Not Found',
        message: 'Trigger not found',
        requestId: auth.requestId,
      });
    }

    console.log('✅ Trigger retrieval completed (%s)', auth.requestId);

    res.status(200).json({
      trigger: {
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
      },
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error('💥 Trigger retrieval error (%s):', auth.requestId, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to retrieve trigger',
      requestId: auth.requestId,
    });
  }
});

/**
 * Create a new trigger
 * POST /triggers
 */
router.post('/', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'Failed to retrieve user ID',
        requestId: auth.requestId,
      });
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

    // Validation
    if (!name || !type || !agentId || !prompt) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Required fields: name, type, agentId, prompt',
        requestId: auth.requestId,
      });
    }

    if (type === 'schedule' && !scheduleConfig?.expression) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'scheduleConfig.expression is required for schedule type triggers',
        requestId: auth.requestId,
      });
    }

    console.log('✨ Trigger creation started (%s):', auth.requestId, {
      userId,
      name,
      type,
      agentId,
    });

    const triggersService = getTriggersDynamoDBService();

    if (!triggersService.isConfigured()) {
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'Triggers Table is not configured',
        requestId: auth.requestId,
      });
    }

    // Create trigger in DynamoDB
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

    // If schedule type, create EventBridge Schedule
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

        // Update trigger with scheduler ARN
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
        // Rollback: delete the trigger
        await triggersService.deleteTrigger(userId, trigger.id);
        throw new Error(
          `Failed to create schedule: ${scheduleError instanceof Error ? scheduleError.message : String(scheduleError)}`
        );
      }
    }

    console.log('✅ Trigger created successfully (%s): ${trigger.id}', auth.requestId);

    res.status(201).json({
      trigger: {
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
      },
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error('💥 Trigger creation error (%s):', auth.requestId, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to create trigger',
      requestId: auth.requestId,
    });
  }
});

// ── PUT /:id helpers ────────────────────────────────────────────────────────

function validateTriggerUpdateAuth(
  req: AuthenticatedRequest,
  res: Response
): { userId: string; requestId: string } | null {
  const auth = getCurrentAuth(req);
  if (!auth.userId) {
    res.status(400).json({
      error: 'Invalid authentication',
      message: 'Failed to retrieve user ID',
      requestId: auth.requestId,
    });
    return null;
  }
  return { userId: auth.userId, requestId: auth.requestId };
}

async function validateTriggerExists(
  triggersService: ReturnType<typeof getTriggersDynamoDBService>,
  userId: string,
  triggerId: string,
  res: Response,
  requestId: string
): Promise<import('../services/triggers-dynamodb.js').Trigger | null> {
  const trigger = await triggersService.getTrigger(userId, triggerId);
  if (!trigger) {
    res.status(404).json({
      error: 'Not Found',
      message: 'Trigger not found',
      requestId,
    });
    return null;
  }
  return trigger;
}

function validateTriggerUpdateFields(
  body: Record<string, unknown>,
  _res: Response,
  _requestId: string
): {
  name: unknown;
  description: unknown;
  type: unknown;
  agentId: unknown;
  prompt: unknown;
  sessionId: unknown;
  modelId: unknown;
  workingDirectory: unknown;
  enabledTools: unknown;
  scheduleConfig: { expression?: string; timezone?: string } | undefined;
  eventConfig: unknown;
} | null {
  const { name, description, type, agentId, prompt, sessionId, modelId, workingDirectory, enabledTools, scheduleConfig, eventConfig } = body;
  return { name, description, type, agentId, prompt, sessionId, modelId, workingDirectory, enabledTools, scheduleConfig: scheduleConfig as { expression?: string; timezone?: string } | undefined, eventConfig };
}

async function handleScheduleUpdate(
  schedulerService: ReturnType<typeof getSchedulerService>,
  trigger: import('../services/triggers-dynamodb.js').Trigger,
  updatedFields: {
    agentId: unknown;
    prompt: unknown;
    sessionId: unknown;
    modelId: unknown;
    workingDirectory: unknown;
    enabledTools: unknown;
    scheduleConfig: { expression?: string; timezone?: string } | undefined;
    type: unknown;
  },
  updatedTrigger: import('../services/triggers-dynamodb.js').Trigger,
  userId: string,
  triggerId: string,
  typeChanged: boolean,
  requestId: string
): Promise<void> {
  const { agentId, prompt, sessionId, modelId, workingDirectory, enabledTools, scheduleConfig, type } = updatedFields;

  const buildPayload = () => ({
    triggerId,
    userId,
    agentId: (agentId as string) || trigger.agentId,
    prompt: (prompt as string) || trigger.prompt,
    sessionId: sessionId !== undefined ? (sessionId as string) : trigger.sessionId,
    modelId: modelId !== undefined ? (modelId as string) : trigger.modelId,
    workingDirectory: workingDirectory !== undefined ? (workingDirectory as string) : trigger.workingDirectory,
    enabledTools: (enabledTools as string[]) || trigger.enabledTools,
  });

  // Handle type change: schedule -> event
  if (typeChanged && trigger.type === 'schedule' && type === 'event') {
    console.log('🔄 Type change detected: schedule -> event (%s)', requestId);
    try {
      await schedulerService.deleteSchedule(triggerId);
      console.log(`✅ EventBridge Schedule deleted for type change`);
    } catch (scheduleError) {
      console.warn('Failed to delete EventBridge Schedule during type change:', scheduleError);
    }
    return;
  }

  // Handle type change: event -> schedule
  if (typeChanged && trigger.type === 'event' && type === 'schedule') {
    console.log('🔄 Type change detected: event -> schedule (%s)', requestId);

    const targetArn = process.env.TRIGGER_LAMBDA_ARN;
    const roleArn = process.env.SCHEDULER_ROLE_ARN;

    if (!targetArn || !roleArn) {
      throw new Error('TRIGGER_LAMBDA_ARN or SCHEDULER_ROLE_ARN not configured');
    }

    try {
      const schedulerArn = await schedulerService.createSchedule({
        name: `trigger-${triggerId}`,
        expression: scheduleConfig!.expression,
        timezone: scheduleConfig!.timezone,
        payload: buildPayload(),
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
    return;
  }

  // Same type = schedule, config updated
  if (updatedTrigger.type === 'schedule' && !typeChanged && scheduleConfig) {
    const targetArn = process.env.TRIGGER_LAMBDA_ARN;
    const roleArn = process.env.SCHEDULER_ROLE_ARN;

    if (targetArn && roleArn) {
      try {
        await schedulerService.updateSchedule(triggerId, {
          expression: scheduleConfig.expression,
          timezone: scheduleConfig.timezone,
          payload: buildPayload(),
          targetArn,
          roleArn,
        });
      } catch (scheduleError) {
        console.warn('Failed to update EventBridge Schedule (non-critical):', scheduleError);
      }
    }
  }
}

function buildTriggerUpdatePayload(body: Record<string, unknown>): import('../services/triggers-dynamodb.js').UpdateTriggerInput {
  const { name, description, type, agentId, prompt, sessionId, modelId, workingDirectory, enabledTools, scheduleConfig, eventConfig } = body;
  return {
    name: name as string | undefined,
    description: description as string | undefined,
    type: type as import('../services/triggers-dynamodb.js').TriggerType | undefined,
    agentId: agentId as string | undefined,
    prompt: prompt as string | undefined,
    sessionId: sessionId as string | undefined,
    modelId: modelId as string | undefined,
    workingDirectory: workingDirectory as string | undefined,
    enabledTools: enabledTools as string[] | undefined,
    scheduleConfig: scheduleConfig as import('../services/triggers-dynamodb.js').ScheduleTriggerConfig | undefined,
    eventConfig: eventConfig as import('../services/triggers-dynamodb.js').EventTriggerConfig | undefined,
  };
}

/**
 * Update a trigger
 * PUT /triggers/:id
 */
router.put('/:id', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const { id: triggerId } = req.params;

    const authResult = validateTriggerUpdateAuth(req, res);
    if (!authResult) return;
    const { userId, requestId } = authResult;

    console.log('✏️ Trigger update started (%s):', requestId, { userId, triggerId });

    const triggersService = getTriggersDynamoDBService();

    if (!triggersService.isConfigured()) {
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'Triggers Table is not configured',
        requestId,
      });
    }

    const existingTrigger = await validateTriggerExists(triggersService, userId, triggerId, res, requestId);
    if (!existingTrigger) return;

    const fields = validateTriggerUpdateFields(req.body, res, requestId);
    if (!fields) return;

    const typeChanged = fields.type && fields.type !== existingTrigger.type;

    // Handle type change: schedule -> event (needs early validation before DB update)
    if (typeChanged && existingTrigger.type === 'event' && fields.type === 'schedule') {
      if (!fields.scheduleConfig?.expression) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'scheduleConfig.expression is required when changing to schedule type',
          requestId,
        });
        return;
      }
    }

    const updatePayload = buildTriggerUpdatePayload(req.body);
    const updatedTrigger = await triggersService.updateTrigger(userId, triggerId, updatePayload);

    const schedulerService = getSchedulerService();
    await handleScheduleUpdate(
      schedulerService,
      existingTrigger,
      { ...fields, type: fields.type },
      updatedTrigger,
      userId,
      triggerId,
      !!typeChanged,
      requestId
    );

    console.log('✅ Trigger updated successfully (%s)', requestId);

    res.status(200).json({
      trigger: {
        id: updatedTrigger.id,
        name: updatedTrigger.name,
        description: updatedTrigger.description,
        type: updatedTrigger.type,
        enabled: updatedTrigger.enabled,
        agentId: updatedTrigger.agentId,
        prompt: updatedTrigger.prompt,
        sessionId: updatedTrigger.sessionId,
        modelId: updatedTrigger.modelId,
        workingDirectory: updatedTrigger.workingDirectory,
        enabledTools: updatedTrigger.enabledTools,
        scheduleConfig: updatedTrigger.scheduleConfig,
        eventConfig: updatedTrigger.eventConfig,
        createdAt: updatedTrigger.createdAt,
        updatedAt: updatedTrigger.updatedAt,
        lastExecutedAt: updatedTrigger.lastExecutedAt,
      },
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error('💥 Trigger update error (%s):', auth.requestId, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to update trigger',
      requestId: auth.requestId,
    });
  }
});

/**
 * Delete a trigger
 * DELETE /triggers/:id
 */
router.delete('/:id', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;
    const { id: triggerId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'Failed to retrieve user ID',
        requestId: auth.requestId,
      });
    }

    console.log('🗑️ Trigger deletion started (%s):', auth.requestId, {
      userId,
      triggerId,
    });

    const triggersService = getTriggersDynamoDBService();

    if (!triggersService.isConfigured()) {
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'Triggers Table is not configured',
        requestId: auth.requestId,
      });
    }

    // Check trigger exists and user owns it
    const trigger = await triggersService.getTrigger(userId, triggerId);
    if (!trigger) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Trigger not found',
        requestId: auth.requestId,
      });
    }

    // Delete EventBridge Schedule if exists
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

    // Delete trigger from DynamoDB
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
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error('💥 Trigger deletion error (%s):', auth.requestId, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to delete trigger',
      requestId: auth.requestId,
    });
  }
});

/**
 * Enable a trigger
 * POST /triggers/:id/enable
 */
router.post('/:id/enable', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;
    const { id: triggerId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'Failed to retrieve user ID',
        requestId: auth.requestId,
      });
    }

    console.log('▶️ Trigger enable started (%s):', auth.requestId, {
      userId,
      triggerId,
    });

    const triggersService = getTriggersDynamoDBService();

    if (!triggersService.isConfigured()) {
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'Triggers Table is not configured',
        requestId: auth.requestId,
      });
    }

    // Check trigger exists and user owns it
    const trigger = await triggersService.getTrigger(userId, triggerId);
    if (!trigger) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Trigger not found',
        requestId: auth.requestId,
      });
    }

    // Update trigger status
    const updatedTrigger = await triggersService.updateTrigger(userId, triggerId, {
      enabled: true,
    });

    // Enable EventBridge Schedule if exists
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
      trigger: {
        id: updatedTrigger.id,
        name: updatedTrigger.name,
        description: updatedTrigger.description,
        type: updatedTrigger.type,
        enabled: updatedTrigger.enabled,
        agentId: updatedTrigger.agentId,
        prompt: updatedTrigger.prompt,
        sessionId: updatedTrigger.sessionId,
        modelId: updatedTrigger.modelId,
        workingDirectory: updatedTrigger.workingDirectory,
        enabledTools: updatedTrigger.enabledTools,
        scheduleConfig: updatedTrigger.scheduleConfig,
        eventConfig: updatedTrigger.eventConfig,
        createdAt: updatedTrigger.createdAt,
        updatedAt: updatedTrigger.updatedAt,
        lastExecutedAt: updatedTrigger.lastExecutedAt,
      },
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error('💥 Trigger enable error (%s):', auth.requestId, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to enable trigger',
      requestId: auth.requestId,
    });
  }
});

/**
 * Disable a trigger
 * POST /triggers/:id/disable
 */
router.post('/:id/disable', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;
    const { id: triggerId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'Failed to retrieve user ID',
        requestId: auth.requestId,
      });
    }

    console.log('⏸️ Trigger disable started (%s):', auth.requestId, {
      userId,
      triggerId,
    });

    const triggersService = getTriggersDynamoDBService();

    if (!triggersService.isConfigured()) {
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'Triggers Table is not configured',
        requestId: auth.requestId,
      });
    }

    // Check trigger exists and user owns it
    const trigger = await triggersService.getTrigger(userId, triggerId);
    if (!trigger) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Trigger not found',
        requestId: auth.requestId,
      });
    }

    // Update trigger status
    const updatedTrigger = await triggersService.updateTrigger(userId, triggerId, {
      enabled: false,
    });

    // Disable EventBridge Schedule if exists
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
      trigger: {
        id: updatedTrigger.id,
        name: updatedTrigger.name,
        description: updatedTrigger.description,
        type: updatedTrigger.type,
        enabled: updatedTrigger.enabled,
        agentId: updatedTrigger.agentId,
        prompt: updatedTrigger.prompt,
        sessionId: updatedTrigger.sessionId,
        modelId: updatedTrigger.modelId,
        workingDirectory: updatedTrigger.workingDirectory,
        enabledTools: updatedTrigger.enabledTools,
        scheduleConfig: updatedTrigger.scheduleConfig,
        eventConfig: updatedTrigger.eventConfig,
        createdAt: updatedTrigger.createdAt,
        updatedAt: updatedTrigger.updatedAt,
        lastExecutedAt: updatedTrigger.lastExecutedAt,
      },
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error('💥 Trigger disable error (%s):', auth.requestId, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to disable trigger',
      requestId: auth.requestId,
    });
  }
});

/**
 * Get execution history for a trigger
 * GET /triggers/:id/executions
 */
router.get(
  '/:id/executions',
  jwtAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const auth = getCurrentAuth(req);
      const userId = auth.userId;
      const { id: triggerId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const nextToken = req.query.nextToken as string | undefined;

      if (!userId) {
        return res.status(400).json({
          error: 'Invalid authentication',
          message: 'Failed to retrieve user ID',
          requestId: auth.requestId,
        });
      }

      console.log('📊 Execution history retrieval started (%s):', auth.requestId, {
        userId,
        triggerId,
        limit,
        hasNextToken: !!nextToken,
      });

      const triggersService = getTriggersDynamoDBService();

      if (!triggersService.isConfigured()) {
        return res.status(500).json({
          error: 'Configuration Error',
          message: 'Triggers Table is not configured',
          requestId: auth.requestId,
        });
      }

      // Check trigger exists and user owns it
      const trigger = await triggersService.getTrigger(userId, triggerId);
      if (!trigger) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Trigger not found',
          requestId: auth.requestId,
        });
      }

      // Decode nextToken if provided
      let exclusiveStartKey: Record<string, unknown> | undefined;
      if (nextToken) {
        try {
          exclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8'));
        } catch {
          return res.status(400).json({
            error: 'Invalid Parameter',
            message: 'Invalid nextToken format',
            requestId: auth.requestId,
          });
        }
      }

      const result = await triggersService.getExecutions(triggerId, limit, exclusiveStartKey);

      // Encode lastEvaluatedKey as nextToken
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
    } catch (error) {
      const auth = getCurrentAuth(req);
      console.error('💥 Execution history retrieval error (%s):', auth.requestId, error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to retrieve execution history',
        requestId: auth.requestId,
      });
    }
  }
);

export default router;
