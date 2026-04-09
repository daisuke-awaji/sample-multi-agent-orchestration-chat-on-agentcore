/**
 * AgentCore Browser tool type definitions
 */

import type { Browser, BrowserContext, Page } from 'playwright-core';

/**
 * Tool execution result
 */
export interface ToolResult {
  status: 'success' | 'error';
  content: Array<{ text?: string; json?: unknown }>;
}

/**
 * Browser session information
 */
export interface SessionInfo {
  sessionId: string;
  sessionName: string;
  browserIdentifier: string;
  automationEndpoint: string;
  liveViewEndpoint?: string;
  createdAt: Date;
  // Playwright CDP connection instances
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
}

// ─── Action type definitions ───

export interface StartSessionAction {
  action: 'startSession';
  sessionName?: string;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface NavigateAction {
  action: 'navigate';
  sessionName?: string;
  url: string;
}

export interface ClickAction {
  action: 'click';
  sessionName?: string;
  selector: string;
}

export interface TypeAction {
  action: 'type';
  sessionName?: string;
  selector: string;
  text: string;
}

export interface ScreenshotAction {
  action: 'screenshot';
  sessionName?: string;
}

export interface GetContentAction {
  action: 'getContent';
  sessionName?: string;
}

export interface ScrollAction {
  action: 'scroll';
  sessionName?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
}

export interface BackAction {
  action: 'back';
  sessionName?: string;
}

export interface ForwardAction {
  action: 'forward';
  sessionName?: string;
}

export interface WaitForElementAction {
  action: 'waitForElement';
  sessionName?: string;
  selector: string;
  timeoutMs?: number;
}

export interface StopSessionAction {
  action: 'stopSession';
  sessionName?: string;
}

export interface GetSessionStatusAction {
  action: 'getSessionStatus';
  sessionName?: string;
}

/**
 * Union of all browser actions
 */
export type BrowserAction =
  | StartSessionAction
  | NavigateAction
  | ClickAction
  | TypeAction
  | ScreenshotAction
  | GetContentAction
  | ScrollAction
  | BackAction
  | ForwardAction
  | WaitForElementAction
  | StopSessionAction
  | GetSessionStatusAction;

/**
 * Browser client options
 */
export interface BrowserClientOptions {
  region?: string;
  browserIdentifier?: string;
  storagePath?: string;
}
