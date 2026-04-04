/**
 * Sub-Agent Task Manager
 * Manages asynchronous execution of sub-agent tasks
 */

import { logger, config } from '../config/index.js';
import { createAgent } from '../agent.js';
import { getAgentDefinition } from './agent-registry.js';
import { getCurrentContext, getCurrentAuthHeader } from '../context/request-context.js';
import { WorkspaceSync } from './workspace-sync.js';
import { WorkspaceSyncHook } from '../session/workspace-sync-hook.js';
import { AgentCoreMemoryStorage } from '../session/agentcore-memory-storage.js';
import { SessionPersistenceHook } from '../session/session-persistence-hook.js';
import { generateSessionId, parseSessionId } from '@moca/core';
import type { SessionId } from '@moca/core';
import type { HookProvider } from '@strands-agents/sdk';
import type { CreateAgentOptions } from '../agent/types.js';

/**
 * Task status
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Sub-agent task definition
 */
export interface SubAgentTask {
  taskId: string;
  agentId: string;
  query: string;
  modelId?: string;
  status: TaskStatus;
  result?: string;
  error?: string;
  progress?: string;
  createdAt: number;
  updatedAt: number;
  parentSessionId?: string;
  sessionId?: string;
  userId?: string;
  maxDepth: number;
  currentDepth: number;
  storagePath?: string;
  /** Captured auth header from parent request context (for Backend API calls in background) */
  authHeader?: string;
}

/**
 * Sub-Agent Task Manager
 * Manages task lifecycle and execution
 */
class SubAgentTaskManager {
  private tasks: Map<string, SubAgentTask> = new Map();
  private readonly MAX_TASKS_PER_SESSION = 5;
  private readonly TASK_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Generate unique task ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Create a new task and start execution in background
   */
  async createTask(
    agentId: string,
    query: string,
    options: {
      modelId?: string;
      parentSessionId?: string;
      sessionId?: string;
      userId?: string;
      currentDepth?: number;
      maxDepth?: number;
      storagePath?: string;
    } = {}
  ): Promise<string> {
    // Check task limit per session
    if (options.parentSessionId) {
      const sessionTasks = Array.from(this.tasks.values()).filter(
        (t) => t.parentSessionId === options.parentSessionId && t.status !== 'completed'
      );
      if (sessionTasks.length >= this.MAX_TASKS_PER_SESSION) {
        throw new Error(
          `Maximum concurrent tasks (${this.MAX_TASKS_PER_SESSION}) reached for this session`
        );
      }
    }

    const taskId = this.generateTaskId();
    // Generate sessionId if not provided (pure alphanumeric, sessionType identifies it as subagent)
    const sessionId = options.sessionId || generateSessionId();

    // Capture auth header from current request context while still in AsyncLocalStorage scope.
    // Background executeTask() may run outside the original context, so we save it here.
    const authHeader = getCurrentAuthHeader();

    const task: SubAgentTask = {
      taskId,
      agentId,
      query,
      modelId: options.modelId,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentSessionId: options.parentSessionId,
      sessionId,
      userId: options.userId,
      maxDepth: options.maxDepth || 2,
      currentDepth: options.currentDepth || 0,
      storagePath: options.storagePath,
      authHeader,
    };

    this.tasks.set(taskId, task);

    // Start background execution (don't await)
    this.executeTask(taskId).catch((error) => {
      logger.error('❌ Background task execution error:', { taskId, error });
      this.updateTaskStatus(taskId, 'failed', undefined, error.message);
    });

    logger.info('📝 Sub-agent task created:', {
      taskId,
      agentId,
      modelId: options.modelId,
      depth: `${options.currentDepth}/${options.maxDepth}`,
    });

    return taskId;
  }

  /**
   * Execute task in background
   */
  private async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.error('❌ Task not found:', { taskId });
      return;
    }

    try {
      // Update status to running
      this.updateTaskStatus(taskId, 'running', 'Initializing sub-agent...');

      // Get agent definition from backend API
      // Use captured authHeader and userId from createTask to avoid AsyncLocalStorage context loss
      const agentDef = await getAgentDefinition(task.agentId, {
        authHeader: task.authHeader,
        userId: task.userId,
      });
      if (!agentDef) {
        throw new Error(`Agent "${task.agentId}" not found`);
      }

      this.updateTaskStatus(taskId, 'running', 'Creating agent instance...');

      // Set storagePath in RequestContext if provided
      const context = getCurrentContext();
      if (task.storagePath && context) {
        context.storagePath = task.storagePath;
        logger.info('📂 Set storagePath in context:', {
          taskId,
          storagePath: task.storagePath,
        });
      }

      // Use stored userId or fallback to context
      const userId = task.userId || context?.userId;

      // Initialize workspace sync if storagePath is provided and we have userId
      let workspaceSync: WorkspaceSync | null = null;
      let workspaceSyncHook: WorkspaceSyncHook | null = null;

      if (task.storagePath && userId) {
        workspaceSync = new WorkspaceSync(userId, task.storagePath);
        workspaceSync.startInitialSync();

        if (context) {
          context.workspaceSync = workspaceSync;
        }

        workspaceSyncHook = new WorkspaceSyncHook(workspaceSync);

        logger.info('🔄 Initialized workspace sync for sub-agent:', {
          taskId,
          userId,
          storagePath: task.storagePath,
        });
      }

      // Initialize session persistence if we have userId and sessionId
      const hooks: HookProvider[] = workspaceSyncHook ? [workspaceSyncHook] : [];
      let sessionStorage = undefined;
      let sessionConfig = undefined;

      if (userId && task.sessionId && config.AGENTCORE_MEMORY_ID) {
        sessionStorage = new AgentCoreMemoryStorage(
          config.AGENTCORE_MEMORY_ID,
          config.BEDROCK_REGION
        );
        // task.sessionId is either generated via generateSessionId() (already SessionId)
        // or provided externally — validate with parseSessionId
        const validSessionId: SessionId = parseSessionId(task.sessionId);
        sessionConfig = {
          actorId: userId,
          sessionId: validSessionId,
          sessionType: 'subagent' as const,
        };

        // Add session persistence hook (pass agentId and storagePath for DynamoDB session metadata)
        const sessionPersistenceHook = new SessionPersistenceHook(
          sessionStorage,
          sessionConfig,
          task.agentId,
          task.storagePath
        );
        hooks.push(sessionPersistenceHook);

        logger.info('💾 Initialized session persistence for sub-agent:', {
          taskId,
          sessionId: task.sessionId,
          actorId: userId,
          memoryId: config.AGENTCORE_MEMORY_ID,
        });
      }

      // Create sub-agent with session persistence
      const agentOptions: CreateAgentOptions = {
        hooks,
        systemPrompt: agentDef.systemPrompt,
        // Filter out call_agent to prevent infinite recursion
        enabledTools: agentDef.enabledTools.filter((t: string) => t !== 'call_agent'),
        modelId: task.modelId || agentDef.modelId,
        sessionStorage,
        sessionConfig,
      };
      const { agent } = await createAgent(agentOptions);

      // Set depth and storagePath in agent state
      agent.state.set('subAgentDepth', task.currentDepth + 1);
      if (task.storagePath) {
        agent.state.set('storagePath', task.storagePath);
      }

      this.updateTaskStatus(taskId, 'running', 'Executing query...');

      // Execute query
      const result = await agent.invoke(task.query);

      // Update to completed
      this.updateTaskStatus(taskId, 'completed', String(result));

      logger.info('✅ Sub-agent task completed:', {
        taskId,
        agentId: task.agentId,
        duration: Date.now() - task.createdAt,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.updateTaskStatus(taskId, 'failed', undefined, errorMessage);
      logger.error('❌ Sub-agent task failed:', { taskId, error });
    }
  }

  /**
   * Update task status
   */
  private updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    result?: string,
    error?: string
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = status;
    task.updatedAt = Date.now();

    if (result !== undefined) {
      task.result = result;
      task.progress = undefined;
    }

    if (error !== undefined) {
      task.error = error;
    }

    // For running status, treat result as progress message
    if (status === 'running' && result !== undefined) {
      task.progress = result;
      task.result = undefined;
    }

    this.tasks.set(taskId, task);
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<SubAgentTask | null> {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Clean up old completed/failed tasks
   */
  async cleanupOldTasks(): Promise<void> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [taskId, task] of this.tasks.entries()) {
      const age = now - task.createdAt;
      if (age > this.TASK_EXPIRATION_MS && ['completed', 'failed'].includes(task.status)) {
        this.tasks.delete(taskId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('🧹 Cleaned up old tasks:', { count: cleanedCount });
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  } {
    const tasks = Array.from(this.tasks.values());
    return {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      running: tasks.filter((t) => t.status === 'running').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
    };
  }
}

// Singleton instance
export const subAgentTaskManager = new SubAgentTaskManager();

// Periodic cleanup (every hour)
setInterval(
  () => {
    subAgentTaskManager.cleanupOldTasks();
  },
  60 * 60 * 1000
);
