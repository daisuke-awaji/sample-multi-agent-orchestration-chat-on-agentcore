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

// Image Attachment types
export interface ImageAttachment {
  id: string;
  file?: File;
  fileName: string;
  mimeType: string;
  size: number;
  previewUrl?: string;
  base64?: string;
}

// Image attachment configuration constants
export const IMAGE_ATTACHMENT_CONFIG = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB per file
  MAX_TOTAL_SIZE: 7 * 1024 * 1024, // 7MB total (Base64 encoded ~9.3MB, within AgentCore Memory 10MB limit)
  MAX_COUNT: 4,
  ACCEPTED_TYPES: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const,
  ACCEPTED_EXTENSIONS: ['.png', '.jpg', '.jpeg', '.webp', '.gif'] as const,
} as const;

export type AcceptedImageType = (typeof IMAGE_ATTACHMENT_CONFIG.ACCEPTED_TYPES)[number];

// Message Content types
export interface MessageContent {
  type: 'text' | 'toolUse' | 'toolResult' | 'image';
  text?: string;
  toolUse?: ToolUse;
  toolResult?: ToolResult;
  image?: ImageAttachment;
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

// Session-specific chat state
export interface SessionChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date;
}

// Chat types
export interface ChatState {
  sessions: Record<string, SessionChatState>;
  activeSessionId: string | null;
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
      text?: string; // For textBlock
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
