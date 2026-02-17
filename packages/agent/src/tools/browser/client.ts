/**
 * AgentCore Browser client implementation
 *
 * Uses @aws-sdk/client-bedrock-agentcore to manage browser sessions
 * and interact with web pages through the AgentCore Browser service.
 *
 * Architecture:
 *   StartBrowserSessionCommand → creates session, returns automationStream endpoint
 *   UpdateBrowserStreamCommand → sends streamUpdate to control the browser
 *   GetBrowserSessionCommand → retrieves session info
 *   StopBrowserSessionCommand → terminates session
 */

import {
  BedrockAgentCoreClient,
  StartBrowserSessionCommand,
  StopBrowserSessionCommand,
  GetBrowserSessionCommand,
  UpdateBrowserStreamCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '../../config/index.js';
import { getCurrentContext, getCurrentStoragePath } from '../../context/request-context.js';
import * as crypto from 'crypto';
import type {
  ToolResult,
  SessionInfo,
  BrowserClientOptions,
  StartSessionAction,
  NavigateAction,
  ClickAction,
  TypeAction,
  ScreenshotAction,
  GetContentAction,
  ScrollAction,
  BackAction,
  ForwardAction,
  WaitForElementAction,
  StopSessionAction,
  GetSessionStatusAction,
} from './types.js';

// Module-level session cache - persists across objects within the same process
const sessionMapping: Map<string, SessionInfo> = new Map();

/**
 * AgentCore Browser client
 */
export class AgentCoreBrowserClient {
  private region: string;
  private browserIdentifier: string;
  private client: BedrockAgentCoreClient;
  private s3Client: S3Client;
  private storagePath: string;
  private defaultSessionName: string;

  constructor(options: BrowserClientOptions = {}) {
    this.region = options.region || process.env.AWS_REGION || 'us-east-1';
    this.browserIdentifier = options.browserIdentifier || 'aws.browser.v1';
    this.storagePath = options.storagePath || '';
    this.defaultSessionName = `browser-${crypto.randomUUID().slice(0, 12)}`;
    this.client = new BedrockAgentCoreClient({ region: this.region });
    this.s3Client = new S3Client({ region: this.region });

    logger.info(
      `[BROWSER] Client initialized: identifier='${this.browserIdentifier}', ` +
        `region='${this.region}', storagePath='${this.storagePath}'`
    );
  }

  /**
   * Start a new browser session
   */
  async startSession(action: StartSessionAction): Promise<ToolResult> {
    const sessionName = action.sessionName || this.defaultSessionName;

    logger.info(`[BROWSER] Starting session: ${sessionName}`);

    // Check if session already exists
    if (sessionMapping.has(sessionName)) {
      const existing = sessionMapping.get(sessionName)!;
      return {
        status: 'success',
        content: [
          {
            json: {
              message: `Session '${sessionName}' already exists`,
              sessionName,
              sessionId: existing.sessionId,
              liveViewUrl: existing.liveViewEndpoint,
            },
          },
        ],
      };
    }

    try {
      const command = new StartBrowserSessionCommand({
        browserIdentifier: this.browserIdentifier,
        name: sessionName,
        sessionTimeoutSeconds: 900, // 15 minutes
        viewPort: {
          width: action.viewportWidth ?? 1280,
          height: action.viewportHeight ?? 720,
        },
      });

      const response = await this.client.send(command);

      const sessionInfo: SessionInfo = {
        sessionId: response.sessionId!,
        sessionName,
        browserIdentifier: response.browserIdentifier || this.browserIdentifier,
        automationEndpoint: response.streams?.automationStream?.streamEndpoint || '',
        liveViewEndpoint: response.streams?.liveViewStream?.streamEndpoint,
        createdAt: response.createdAt || new Date(),
      };

      sessionMapping.set(sessionName, sessionInfo);

      logger.info(
        `[BROWSER] Session started: ${sessionName} (ID: ${sessionInfo.sessionId})`
      );

      return {
        status: 'success',
        content: [
          {
            json: {
              sessionName,
              sessionId: sessionInfo.sessionId,
              liveViewUrl: sessionInfo.liveViewEndpoint,
              message: 'Browser session started successfully. You can now navigate to URLs.',
            },
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[BROWSER] Failed to start session: ${errorMessage}`);
      return {
        status: 'error',
        content: [{ text: `Failed to start browser session: ${errorMessage}` }],
      };
    }
  }

  /**
   * Navigate to a URL
   */
  async navigate(action: NavigateAction): Promise<ToolResult> {
    if (!action.url) {
      return { status: 'error', content: [{ text: 'URL is required for navigate action' }] };
    }

    const session = await this.ensureSession(action.sessionName);

    logger.info(`[BROWSER] Navigating to: ${action.url}`);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const streamUpdate: any = {
        automationInput: {
          navigate: {
            url: action.url,
          },
        },
      };

      const response = await this.sendStreamUpdate(session, streamUpdate);
      return this.formatAutomationResult('navigate', response, { url: action.url });
    } catch (error) {
      return this.handleError('navigate', error);
    }
  }

  /**
   * Click an element
   */
  async click(action: ClickAction): Promise<ToolResult> {
    if (!action.selector) {
      return { status: 'error', content: [{ text: 'Selector is required for click action' }] };
    }

    const session = await this.ensureSession(action.sessionName);

    logger.info(`[BROWSER] Clicking: ${action.selector}`);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const streamUpdate: any = {
        automationInput: {
          click: {
            selector: action.selector,
          },
        },
      };

      const response = await this.sendStreamUpdate(session, streamUpdate);
      return this.formatAutomationResult('click', response, { selector: action.selector });
    } catch (error) {
      return this.handleError('click', error);
    }
  }

  /**
   * Type text into an element
   */
  async type(action: TypeAction): Promise<ToolResult> {
    if (!action.selector) {
      return { status: 'error', content: [{ text: 'Selector is required for type action' }] };
    }
    if (!action.text) {
      return { status: 'error', content: [{ text: 'Text is required for type action' }] };
    }

    const session = await this.ensureSession(action.sessionName);

    logger.info(`[BROWSER] Typing into: ${action.selector}`);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const streamUpdate: any = {
        automationInput: {
          type: {
            selector: action.selector,
            text: action.text,
          },
        },
      };

      const response = await this.sendStreamUpdate(session, streamUpdate);
      return this.formatAutomationResult('type', response, {
        selector: action.selector,
        textLength: action.text.length,
      });
    } catch (error) {
      return this.handleError('type', error);
    }
  }

  /**
   * Take a screenshot and save to S3
   */
  async screenshot(action: ScreenshotAction): Promise<ToolResult> {
    const session = await this.ensureSession(action.sessionName);

    logger.info(`[BROWSER] Taking screenshot`);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const streamUpdate: any = {
        automationInput: {
          screenshot: {},
        },
      };

      const response = await this.sendStreamUpdate(session, streamUpdate);

      // Try to extract and save screenshot image to S3
      const screenshotPath = await this.saveScreenshotToS3(response);

      if (screenshotPath) {
        return {
          status: 'success',
          content: [
            {
              json: {
                action: 'screenshot',
                imagePath: screenshotPath,
                message: `Screenshot saved. Reference it as: ${screenshotPath}`,
              },
            },
          ],
        };
      }

      return this.formatAutomationResult('screenshot', response);
    } catch (error) {
      return this.handleError('screenshot', error);
    }
  }

  /**
   * Get text content from the current page
   */
  async getContent(action: GetContentAction): Promise<ToolResult> {
    const session = await this.ensureSession(action.sessionName);

    logger.info(`[BROWSER] Getting page content`);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const streamUpdate: any = {
        automationInput: {
          getContent: {},
        },
      };

      const response = await this.sendStreamUpdate(session, streamUpdate);
      return this.formatAutomationResult('getContent', response);
    } catch (error) {
      return this.handleError('getContent', error);
    }
  }

  /**
   * Scroll the page
   */
  async scroll(action: ScrollAction): Promise<ToolResult> {
    const session = await this.ensureSession(action.sessionName);

    const direction = action.direction || 'down';
    const amount = action.amount || 500;

    logger.info(`[BROWSER] Scrolling ${direction} by ${amount}px`);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const streamUpdate: any = {
        automationInput: {
          scroll: {
            direction,
            amount,
          },
        },
      };

      const response = await this.sendStreamUpdate(session, streamUpdate);
      return this.formatAutomationResult('scroll', response, { direction, amount });
    } catch (error) {
      return this.handleError('scroll', error);
    }
  }

  /**
   * Navigate back in browser history
   */
  async back(action: BackAction): Promise<ToolResult> {
    const session = await this.ensureSession(action.sessionName);

    logger.info(`[BROWSER] Navigating back`);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const streamUpdate: any = {
        automationInput: {
          back: {},
        },
      };

      const response = await this.sendStreamUpdate(session, streamUpdate);
      return this.formatAutomationResult('back', response);
    } catch (error) {
      return this.handleError('back', error);
    }
  }

  /**
   * Navigate forward in browser history
   */
  async forward(action: ForwardAction): Promise<ToolResult> {
    const session = await this.ensureSession(action.sessionName);

    logger.info(`[BROWSER] Navigating forward`);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const streamUpdate: any = {
        automationInput: {
          forward: {},
        },
      };

      const response = await this.sendStreamUpdate(session, streamUpdate);
      return this.formatAutomationResult('forward', response);
    } catch (error) {
      return this.handleError('forward', error);
    }
  }

  /**
   * Wait for an element to appear on the page
   */
  async waitForElement(action: WaitForElementAction): Promise<ToolResult> {
    if (!action.selector) {
      return {
        status: 'error',
        content: [{ text: 'Selector is required for waitForElement action' }],
      };
    }

    const session = await this.ensureSession(action.sessionName);
    const timeoutMs = action.timeoutMs || 10000;

    logger.info(`[BROWSER] Waiting for element: ${action.selector} (timeout: ${timeoutMs}ms)`);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const streamUpdate: any = {
        automationInput: {
          waitForElement: {
            selector: action.selector,
            timeoutMs,
          },
        },
      };

      const response = await this.sendStreamUpdate(session, streamUpdate);
      return this.formatAutomationResult('waitForElement', response, {
        selector: action.selector,
      });
    } catch (error) {
      return this.handleError('waitForElement', error);
    }
  }

  /**
   * Stop a browser session
   */
  async stopSession(action: StopSessionAction): Promise<ToolResult> {
    const sessionName = action.sessionName || this.defaultSessionName;
    const session = sessionMapping.get(sessionName);

    if (!session) {
      return {
        status: 'error',
        content: [{ text: `Session '${sessionName}' not found` }],
      };
    }

    logger.info(`[BROWSER] Stopping session: ${sessionName}`);

    try {
      const command = new StopBrowserSessionCommand({
        browserIdentifier: session.browserIdentifier,
        sessionId: session.sessionId,
      });

      await this.client.send(command);
      sessionMapping.delete(sessionName);

      logger.info(`[BROWSER] Session stopped: ${sessionName}`);

      return {
        status: 'success',
        content: [{ text: `Browser session '${sessionName}' stopped successfully.` }],
      };
    } catch (error) {
      // Even if stop fails, remove from cache to prevent stale references
      sessionMapping.delete(sessionName);
      return this.handleError('stopSession', error);
    }
  }

  /**
   * Get session status
   */
  async getSessionStatus(action: GetSessionStatusAction): Promise<ToolResult> {
    const sessionName = action.sessionName || this.defaultSessionName;
    const session = sessionMapping.get(sessionName);

    if (!session) {
      return {
        status: 'success',
        content: [
          {
            json: {
              sessionName,
              exists: false,
              message: `No active session named '${sessionName}'. Use startSession to create one.`,
              activeSessions: Array.from(sessionMapping.keys()),
            },
          },
        ],
      };
    }

    logger.info(`[BROWSER] Getting session status: ${sessionName}`);

    try {
      const command = new GetBrowserSessionCommand({
        browserIdentifier: session.browserIdentifier,
        sessionId: session.sessionId,
      });

      const response = await this.client.send(command);

      return {
        status: 'success',
        content: [
          {
            json: {
              sessionName,
              sessionId: session.sessionId,
              exists: true,
              status: response.status || 'UNKNOWN',
              createdAt: session.createdAt.toISOString(),
              liveViewUrl: session.liveViewEndpoint,
              activeSessions: Array.from(sessionMapping.keys()),
            },
          },
        ],
      };
    } catch (error) {
      return this.handleError('getSessionStatus', error);
    }
  }

  /**
   * List all active sessions (for debugging)
   */
  listSessions(): ToolResult {
    const sessions = Array.from(sessionMapping.entries()).map(([name, info]) => ({
      sessionName: name,
      sessionId: info.sessionId,
      createdAt: info.createdAt.toISOString(),
    }));

    return {
      status: 'success',
      content: [
        {
          json: {
            activeSessions: sessions,
            count: sessions.length,
          },
        },
      ],
    };
  }

  // ─── Private methods ───

  /**
   * Ensure a session exists, creating one automatically if needed
   */
  private async ensureSession(sessionName?: string): Promise<SessionInfo> {
    const name = sessionName || this.defaultSessionName;

    if (sessionMapping.has(name)) {
      return sessionMapping.get(name)!;
    }

    // Auto-create session
    logger.info(`[BROWSER] Auto-creating session: ${name}`);
    const result = await this.startSession({
      action: 'startSession',
      sessionName: name,
    });

    if (result.status === 'error') {
      throw new Error(`Failed to auto-create browser session: ${JSON.stringify(result.content)}`);
    }

    const session = sessionMapping.get(name);
    if (!session) {
      throw new Error(`Session '${name}' not found after creation`);
    }

    return session;
  }

  /**
   * Send a stream update command to the browser
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async sendStreamUpdate(session: SessionInfo, streamUpdate: any): Promise<any> {
    const command = new UpdateBrowserStreamCommand({
      browserIdentifier: session.browserIdentifier,
      sessionId: session.sessionId,
      streamUpdate,
    });

    return await this.client.send(command);
  }

  /**
   * Format automation result into a ToolResult
   */
  private formatAutomationResult(
    actionName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extraInfo?: Record<string, any>
  ): ToolResult {
    try {
      // Extract useful information from the response
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: Record<string, any> = {
        action: actionName,
        success: true,
      };

      // Add extra info if provided
      if (extraInfo) {
        Object.assign(result, extraInfo);
      }

      // Try to extract automation output from response
      if (response.automationOutput) {
        result.output = response.automationOutput;
      }

      // Extract page info if available
      if (response.pageInfo) {
        result.pageInfo = response.pageInfo;
      }

      // Extract content if available (for getContent action)
      if (response.content) {
        result.content = typeof response.content === 'string'
          ? this.truncateContent(response.content, 10000)
          : response.content;
      }

      return {
        status: 'success',
        content: [{ json: result }],
      };
    } catch {
      // Fallback: return raw response info
      return {
        status: 'success',
        content: [
          {
            json: {
              action: actionName,
              success: true,
              rawResponse: JSON.stringify(response).slice(0, 5000),
            },
          },
        ],
      };
    }
  }

  /**
   * Save screenshot to S3 storage
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async saveScreenshotToS3(response: any): Promise<string | null> {
    try {
      const bucketName = process.env.USER_STORAGE_BUCKET_NAME;
      if (!bucketName) {
        logger.warn('[BROWSER] S3 bucket not configured, skipping screenshot storage');
        return null;
      }

      // Try to extract base64 image from response
      let imageBase64: string | null = null;

      if (response.automationOutput?.screenshot?.imageBase64) {
        imageBase64 = response.automationOutput.screenshot.imageBase64;
      } else if (response.screenshot?.imageBase64) {
        imageBase64 = response.screenshot.imageBase64;
      } else if (response.image) {
        imageBase64 = response.image;
      }

      if (!imageBase64) {
        logger.info('[BROWSER] No screenshot image data in response');
        return null;
      }

      // Get user context
      const context = getCurrentContext();
      const userId = context?.userId || 'anonymous';
      const storagePath = getCurrentStoragePath();

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `screenshot-${timestamp}.png`;
      const basePath = `users/${userId}/${storagePath}/browser-screenshots`;
      const s3Key = `${basePath}/${filename}`.replace(/\/+/g, '/');

      // Convert and upload
      const imageBuffer = Buffer.from(imageBase64, 'base64');

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: imageBuffer,
        ContentType: 'image/png',
        Metadata: {
          'generated-by': 'agentcore-browser',
          'generated-at': new Date().toISOString(),
        },
      });

      await this.s3Client.send(command);

      // Return user-facing path
      const userPath = `/${storagePath}/browser-screenshots/${filename}`.replace(/\/+/g, '/');
      logger.info(
        `[BROWSER] Screenshot saved to S3: ${s3Key} (${this.formatFileSize(imageBuffer.length)})`
      );

      return userPath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`[BROWSER] Failed to save screenshot to S3: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Handle errors from browser operations
   */
  private handleError(actionName: string, error: unknown): ToolResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[BROWSER] Error in ${actionName}: ${errorMessage}`);

    return {
      status: 'error',
      content: [{ text: `Browser ${actionName} failed: ${errorMessage}` }],
    };
  }

  /**
   * Truncate content to a safe size
   */
  private truncateContent(content: string, maxLength: number = 10000): string {
    if (content.length <= maxLength) {
      return content;
    }
    return `${content.substring(0, maxLength)}... (Content truncated. Original length: ${content.length} characters)`;
  }

  /**
   * Format file size to human-readable string
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}
