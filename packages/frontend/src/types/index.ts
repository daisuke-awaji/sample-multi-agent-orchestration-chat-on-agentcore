// User types
export interface User {
  userId: string; // Cognito sub (UUID)
  username: string;
  email?: string;
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
}

// Tool Use types
export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status?: 'pending' | 'running' | 'completed' | 'error';
  originalToolUseId?: string;
}

// Tool Result types
export interface ToolResult {
  toolUseId: string;
  content: string;
  isError?: boolean;
}

// Message Content types
export interface MessageContent {
  type: 'text' | 'toolUse' | 'toolResult';
  text?: string;
  toolUse?: ToolUse;
  toolResult?: ToolResult;
}

// Message types
export interface Message {
  id: string;
  type: 'user' | 'assistant';
  contents: MessageContent[]; // Changed from single content string to multiple content blocks
  timestamp: Date;
  isStreaming?: boolean;
  isError?: boolean; // Flag to indicate this message contains an error
}

// Legacy support for single content string (backward compatibility)
export interface LegacyMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

// Chat types
export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sessionId: string | null;
}

// Auth types
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  needsConfirmation: boolean;
  pendingUsername: string | null;
}

// API types
export interface AgentStreamEvent {
  type: string;
  [key: string]: unknown;
}

export interface ModelContentBlockDeltaEvent extends AgentStreamEvent {
  type: 'modelContentBlockDeltaEvent';
  delta: {
    type: 'textDelta';
    text: string;
  };
}

export interface ModelContentBlockStartEvent extends AgentStreamEvent {
  type: 'modelContentBlockStartEvent';
  start?: {
    type: string;
    name?: string;
    input?: Record<string, unknown>;
    toolUseId?: string;
  };
}

export interface MessageAddedEvent extends AgentStreamEvent {
  type: 'messageAddedEvent';
  message?: {
    role?: string;
    content?: Array<{
      type: string;
      toolUseId?: string;
      content?: string;
      isError?: boolean;
      [key: string]: unknown;
    }>;
  };
}

export interface BeforeToolsEvent extends AgentStreamEvent {
  type: 'beforeToolsEvent';
  message?: {
    role: string;
    content: Array<{
      type: string;
      name?: string;
      input?: Record<string, unknown>;
      toolUseId?: string;
      text?: string; // textBlock用
      [key: string]: unknown;
    }>;
  };
}

export interface AfterToolsEvent extends AgentStreamEvent {
  type: 'afterToolsEvent';
  [key: string]: unknown;
}

export interface ServerCompletionEvent extends AgentStreamEvent {
  type: 'serverCompletionEvent';
  metadata: {
    requestId: string;
    duration: number;
    sessionId: string;
    conversationLength: number;
  };
}

export interface ServerErrorEvent extends AgentStreamEvent {
  type: 'serverErrorEvent';
  error: {
    message: string;
    requestId: string;
    savedToHistory?: boolean; // Indicates if error was saved to session history
  };
}

// Config types
export interface AgentConfig {
  endpoint: string;
  cognitoConfig: {
    userPoolId: string;
    clientId: string;
    region: string;
  };
}
