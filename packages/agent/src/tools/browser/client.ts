/**
 * AgentCore Browser client implementation
 *
 * Uses @aws-sdk/client-bedrock-agentcore to manage browser sessions
 * and Playwright CDP connection for browser automation.
 *
 * Architecture:
 *   StartBrowserSessionCommand → creates session, returns automationStream endpoint
 *   Playwright connect_over_cdp → connects via WebSocket to control the browser
 *   StopBrowserSessionCommand → terminates session
 *
 * The automation stream endpoint provides a WebSocket-based CDP (Chrome DevTools Protocol)
 * connection that Playwright uses for all browser interactions (navigate, click, screenshot, etc.).
 */

import {
  BedrockAgentCoreClient,
  StartBrowserSessionCommand,
  StopBrowserSessionCommand,
  GetBrowserSessionCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { chromium } from 'playwright-core';
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
 *
 * Uses Playwright CDP connection for browser automation instead of
 * UpdateBrowserStreamCommand (which is only for enabling/disabling automation streams).
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
   * Start a new browser session and connect via Playwright CDP
   */
  async startSession(action: StartSessionAction): Promise<ToolResult> {
    const sessionName = action.sessionName || this.defaultSessionName;

    logger.info(`[BROWSER] Starting session: ${sessionName}`);

    // Check if session already exists and has a live Playwright connection
    if (sessionMapping.has(sessionName)) {
      const existing = sessionMapping.get(sessionName)!;
      if (existing.browser?.isConnected()) {
        return {
          status: 'success',
          content: [
            {
              json: {
                message: `Session '${sessionName}' already exists and is connected`,
                sessionName,
                sessionId: existing.sessionId,
                liveViewUrl: existing.liveViewEndpoint,
              },
            },
          ],
        };
      }
      // Session exists but Playwright is disconnected - clean up and recreate
      logger.info(`[BROWSER] Session '${sessionName}' exists but disconnected, recreating`);
      sessionMapping.delete(sessionName);
    }

    try {
      // Step 1: Create browser session via AgentCore API
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

      const automationEndpoint = response.streams?.automationStream?.streamEndpoint || '';
      const liveViewEndpoint = response.streams?.liveViewStream?.streamEndpoint;

      if (!automationEndpoint) {
        throw new Error('No automation stream endpoint returned from StartBrowserSession');
      }

      logger.info(
        `[BROWSER] Session created: ${sessionName} (ID: ${response.sessionId}), ` +
          `automation endpoint: ${automationEndpoint}`
      );

      // Step 2: Generate SigV4-signed WebSocket URL and headers for CDP connection
      const { wsUrl, headers } = await this.generateSignedWebSocketHeaders(automationEndpoint);

      logger.info(`[BROWSER] Connecting to browser via CDP: ${wsUrl}`);

      // Step 3: Connect Playwright via CDP
      const browser = await chromium.connectOverCDP(wsUrl, {
        headers,
      });

      // Get or create context and page
      const context =
        browser.contexts().length > 0 ? browser.contexts()[0] : await browser.newContext();
      const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

      const sessionInfo: SessionInfo = {
        sessionId: response.sessionId!,
        sessionName,
        browserIdentifier: response.browserIdentifier || this.browserIdentifier,
        automationEndpoint,
        liveViewEndpoint,
        createdAt: response.createdAt || new Date(),
        browser,
        context,
        page,
      };

      sessionMapping.set(sessionName, sessionInfo);

      logger.info(
        `[BROWSER] Session started and CDP connected: ${sessionName} (ID: ${sessionInfo.sessionId})`
      );

      return {
        status: 'success',
        content: [
          {
            json: {
              sessionName,
              sessionId: sessionInfo.sessionId,
              liveViewUrl: sessionInfo.liveViewEndpoint,
              message:
                'Browser session started and CDP connected successfully. You can now navigate to URLs.',
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
    const page = this.getPage(session);

    logger.info(`[BROWSER] Navigating to: ${action.url}`);

    try {
      const response = await page.goto(action.url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      const title = await page.title();

      return {
        status: 'success',
        content: [
          {
            json: {
              action: 'navigate',
              url: action.url,
              title,
              statusCode: response?.status(),
              success: true,
            },
          },
        ],
      };
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
    const page = this.getPage(session);

    logger.info(`[BROWSER] Clicking: ${action.selector}`);

    try {
      await page.click(action.selector, { timeout: 10000 });

      // Wait briefly for any navigation or DOM updates
      await page.waitForTimeout(500);

      const title = await page.title();
      const url = page.url();

      return {
        status: 'success',
        content: [
          {
            json: {
              action: 'click',
              selector: action.selector,
              currentUrl: url,
              currentTitle: title,
              success: true,
            },
          },
        ],
      };
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
    const page = this.getPage(session);

    logger.info(`[BROWSER] Typing into: ${action.selector}`);

    try {
      // Clear existing content and type new text
      await page.fill(action.selector, action.text, { timeout: 10000 });

      return {
        status: 'success',
        content: [
          {
            json: {
              action: 'type',
              selector: action.selector,
              textLength: action.text.length,
              success: true,
            },
          },
        ],
      };
    } catch (error) {
      return this.handleError('type', error);
    }
  }

  /**
   * Take a screenshot using CDP and save to S3
   */
  async screenshot(action: ScreenshotAction): Promise<ToolResult> {
    const session = await this.ensureSession(action.sessionName);
    const page = this.getPage(session);

    logger.info(`[BROWSER] Taking screenshot`);

    try {
      // Use CDP session for high-quality screenshot capture
      const cdpSession = await session.context!.newCDPSession(page);
      const screenshotResult = await cdpSession.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      await cdpSession.detach();

      const imageBase64 = screenshotResult.data;

      if (!imageBase64) {
        logger.warn('[BROWSER] No screenshot data returned from CDP');
        return {
          status: 'success',
          content: [
            {
              json: {
                action: 'screenshot',
                message: 'Screenshot captured but no image data was returned.',
              },
            },
          ],
        };
      }

      // Save to S3
      const screenshotPath = await this.saveScreenshotToS3(imageBase64);
      const title = await page.title();
      const url = page.url();

      if (screenshotPath) {
        return {
          status: 'success',
          content: [
            {
              json: {
                action: 'screenshot',
                imagePath: screenshotPath,
                currentUrl: url,
                currentTitle: title,
                message: `Screenshot saved. Reference it as: ${screenshotPath}`,
              },
            },
          ],
        };
      }

      // Fallback: return info without S3 path
      return {
        status: 'success',
        content: [
          {
            json: {
              action: 'screenshot',
              currentUrl: url,
              currentTitle: title,
              message:
                'Screenshot captured but could not be saved to S3. Check S3 bucket configuration.',
            },
          },
        ],
      };
    } catch (error) {
      return this.handleError('screenshot', error);
    }
  }

  /**
   * Get text content from the current page
   */
  async getContent(action: GetContentAction): Promise<ToolResult> {
    const session = await this.ensureSession(action.sessionName);
    const page = this.getPage(session);

    logger.info(`[BROWSER] Getting page content`);

    try {
      const title = await page.title();
      const url = page.url();

      const textContent = (await page.evaluate('() => document.body.innerText')) as string;

      return {
        status: 'success',
        content: [
          {
            json: {
              action: 'getContent',
              url,
              title,
              textContent: this.truncateContent(textContent, 10000),
              success: true,
            },
          },
        ],
      };
    } catch (error) {
      return this.handleError('getContent', error);
    }
  }

  /**
   * Scroll the page
   */
  async scroll(action: ScrollAction): Promise<ToolResult> {
    const session = await this.ensureSession(action.sessionName);
    const page = this.getPage(session);

    const direction = action.direction || 'down';
    const amount = action.amount || 500;

    logger.info(`[BROWSER] Scrolling ${direction} by ${amount}px`);

    try {
      // Compute scroll deltas based on direction
      let deltaX = 0;
      let deltaY = 0;
      switch (direction) {
        case 'down':
          deltaY = amount;
          break;
        case 'up':
          deltaY = -amount;
          break;
        case 'right':
          deltaX = amount;
          break;
        case 'left':
          deltaX = -amount;
          break;
      }

      await page.evaluate('({dx, dy}) => window.scrollBy(dx, dy)', { dx: deltaX, dy: deltaY });

      // Wait briefly for scroll to settle
      await page.waitForTimeout(300);

      const scrollPosition = (await page.evaluate(
        '() => ({ scrollX: window.scrollX, scrollY: window.scrollY, scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight })'
      )) as { scrollX: number; scrollY: number; scrollHeight: number; clientHeight: number };

      return {
        status: 'success',
        content: [
          {
            json: {
              action: 'scroll',
              direction,
              amount,
              ...scrollPosition,
              success: true,
            },
          },
        ],
      };
    } catch (error) {
      return this.handleError('scroll', error);
    }
  }

  /**
   * Navigate back in browser history
   */
  async back(action: BackAction): Promise<ToolResult> {
    const session = await this.ensureSession(action.sessionName);
    const page = this.getPage(session);

    logger.info(`[BROWSER] Navigating back`);

    try {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });

      const title = await page.title();
      const url = page.url();

      return {
        status: 'success',
        content: [
          {
            json: {
              action: 'back',
              currentUrl: url,
              currentTitle: title,
              success: true,
            },
          },
        ],
      };
    } catch (error) {
      return this.handleError('back', error);
    }
  }

  /**
   * Navigate forward in browser history
   */
  async forward(action: ForwardAction): Promise<ToolResult> {
    const session = await this.ensureSession(action.sessionName);
    const page = this.getPage(session);

    logger.info(`[BROWSER] Navigating forward`);

    try {
      await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 });

      const title = await page.title();
      const url = page.url();

      return {
        status: 'success',
        content: [
          {
            json: {
              action: 'forward',
              currentUrl: url,
              currentTitle: title,
              success: true,
            },
          },
        ],
      };
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
    const page = this.getPage(session);
    const timeoutMs = action.timeoutMs || 10000;

    logger.info(`[BROWSER] Waiting for element: ${action.selector} (timeout: ${timeoutMs}ms)`);

    try {
      await page.waitForSelector(action.selector, {
        timeout: timeoutMs,
        state: 'visible',
      });

      return {
        status: 'success',
        content: [
          {
            json: {
              action: 'waitForElement',
              selector: action.selector,
              found: true,
              success: true,
            },
          },
        ],
      };
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
      // Step 1: Disconnect Playwright
      if (session.browser?.isConnected()) {
        try {
          await session.browser.close();
        } catch (closeError) {
          logger.warn(
            `[BROWSER] Error closing Playwright browser: ${closeError instanceof Error ? closeError.message : String(closeError)}`
          );
        }
      }

      // Step 2: Stop AgentCore browser session
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
              cdpConnected: session.browser?.isConnected() ?? false,
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
      cdpConnected: info.browser?.isConnected() ?? false,
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
   * Get the active Page from a session, throwing if not available
   */
  private getPage(session: SessionInfo): import('playwright-core').Page {
    if (!session.page) {
      throw new Error(
        `No active page for session '${session.sessionName}'. The CDP connection may have been lost.`
      );
    }
    if (session.page.isClosed()) {
      throw new Error(
        `Page is closed for session '${session.sessionName}'. The browser session may have expired.`
      );
    }
    return session.page;
  }

  /**
   * Ensure a session exists, creating one automatically if needed
   */
  private async ensureSession(sessionName?: string): Promise<SessionInfo> {
    const name = sessionName || this.defaultSessionName;

    if (sessionMapping.has(name)) {
      const session = sessionMapping.get(name)!;
      // Verify CDP connection is still alive
      if (session.browser?.isConnected()) {
        return session;
      }
      // Connection lost - clean up and recreate
      logger.warn(`[BROWSER] CDP connection lost for session '${name}', recreating`);
      sessionMapping.delete(name);
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
   * Generate SigV4-signed WebSocket URL and headers for CDP connection
   *
   * The automation stream endpoint needs to be called with SigV4 authentication.
   * This generates the required authorization headers.
   */
  private async generateSignedWebSocketHeaders(
    automationEndpoint: string
  ): Promise<{ wsUrl: string; headers: Record<string, string> }> {
    const url = new URL(automationEndpoint);

    const signer = new SignatureV4({
      service: 'bedrock-agentcore',
      region: this.region,
      credentials: defaultProvider(),
      sha256: Sha256,
    });

    // Create the request to sign
    const request = {
      method: 'GET' as const,
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port ? parseInt(url.port) : 443,
      path: url.pathname + url.search,
      headers: {
        host: url.hostname,
      },
    };

    const signedRequest = await signer.sign(request);

    // Build the headers (excluding 'host' which is set automatically by WebSocket)
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(signedRequest.headers)) {
      if (key.toLowerCase() !== 'host') {
        headers[key] = value as string;
      }
    }

    return { wsUrl: automationEndpoint, headers };
  }

  /**
   * Save screenshot base64 data to S3 storage
   */
  private async saveScreenshotToS3(imageBase64: string): Promise<string | null> {
    try {
      const bucketName = process.env.USER_STORAGE_BUCKET_NAME;
      if (!bucketName) {
        logger.warn('[BROWSER] S3 bucket not configured, skipping screenshot storage');
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
