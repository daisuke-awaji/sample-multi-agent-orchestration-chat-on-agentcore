/**
 * SummarizingConversationManager — Type Definitions
 *
 * Defines the interfaces for a conversation manager that summarizes
 * truncated messages before removing them, preserving context that
 * would otherwise be permanently lost by SlidingWindowConversationManager.
 *
 * Design Principles:
 *   - HookProvider-compatible (same integration as SlidingWindowConversationManager)
 *   - Strategy pattern for summarization (pluggable ConversationSummarizer)
 *   - Summary stored as message pair at conversation head (user+assistant)
 *   - Rolling summaries: previous summary is included in next summarization
 *   - All public methods are independently testable
 */

import type { Message } from '@strands-agents/sdk';
import type { AgentData } from '@strands-agents/sdk/dist/src/types/agent.js';
import type { Model, BaseModelConfig } from '@strands-agents/sdk/dist/src/models/model.js';

// ---------------------------------------------------------------------------
// Summary Data
// ---------------------------------------------------------------------------

/** Metadata about a generated summary. */
export interface ConversationSummary {
  /** The generated summary text. */
  text: string;
  /** Number of messages that were summarized (excluding any prior summary). */
  summarizedMessageCount: number;
  /** Timestamp when the summary was generated. */
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Summarizer Strategy (pluggable)
// ---------------------------------------------------------------------------

/**
 * Strategy interface for conversation summarization.
 *
 * Implementations can use LLM calls, rule-based extraction, external APIs, etc.
 * The default implementation (ModelBasedSummarizer) uses a Bedrock model.
 *
 * @example Custom summarizer
 * ```typescript
 * const ruleBased: ConversationSummarizer = {
 *   async summarize(messages, existing) {
 *     const topics = messages.map(m => extractTopic(m));
 *     return `Topics discussed: ${topics.join(', ')}`;
 *   }
 * };
 * ```
 */
export interface ConversationSummarizer {
  /**
   * Generate a summary from the given messages.
   *
   * @param messagesToSummarize - Messages that will be removed from history
   * @param existingSummary     - Previous rolling summary (null if first summarization)
   * @returns The summary text
   */
  summarize(messagesToSummarize: Message[], existingSummary: string | null): Promise<string>;
}

// ---------------------------------------------------------------------------
// ModelBasedSummarizer Config
// ---------------------------------------------------------------------------

/** Configuration for the built-in LLM-based summarizer. */
export interface ModelBasedSummarizerConfig {
  /**
   * Model to use for summarization.
   * If omitted, resolved at runtime from agent instance.
   */
  model?: Model<BaseModelConfig>;

  /**
   * System prompt for the summarization request.
   * Should instruct the model on how to produce the summary.
   *
   * @default See DEFAULT_SUMMARY_PROMPT
   */
  prompt?: string;

  /**
   * Maximum tokens for the summary response.
   * @default 2048
   */
  maxTokens?: number;
}

// ---------------------------------------------------------------------------
// SummarizingConversationManager Config
// ---------------------------------------------------------------------------

/**
 * Configuration for SummarizingConversationManager.
 *
 * ```
 * ┌──────────────────────────────────────────────────────────────┐
 * │                    messages array (100件)                     │
 * ├────────────────────────────┬─────────────────────────────────┤
 * │  summarize & remove (60)   │      keep (targetSize=40)       │
 * │  ← oldest                  │                     newest →    │
 * └────────────────────────────┴─────────────────────────────────┘
 *         ↓ LLM summarize
 * ┌───────────────────────────────────────────────────────────────┐
 * │ [summary_user, summary_asst] + kept messages (40)  = 42件    │
 * └───────────────────────────────────────────────────────────────┘
 * ```
 */
export interface SummarizingConversationManagerConfig {
  /**
   * Trigger threshold: summarization runs when messages.length > windowSize.
   *
   * Must be an even number ≥ 4 (2 for summary pair + at least 2 for conversation).
   * @default 40
   */
  windowSize?: number;

  /**
   * Number of recent messages to keep after summarization.
   * The removed messages (oldest) are summarized before deletion.
   *
   * Must be an even number ≥ 2 and < windowSize.
   * @default Math.floor(windowSize / 2) (rounded to even)
   */
  targetSize?: number;

  /**
   * Custom summarization strategy.
   *
   * When provided, `summaryModel`, `summaryPrompt`, and `maxSummaryTokens`
   * are ignored.
   */
  summarizer?: ConversationSummarizer;

  /**
   * Model for the built-in summarizer.
   * If omitted, resolved at runtime from agent instance.
   * Ignored when `summarizer` is provided.
   */
  summaryModel?: Model<BaseModelConfig>;

  /**
   * Prompt template for the built-in summarizer.
   * Ignored when `summarizer` is provided.
   */
  summaryPrompt?: string;

  /**
   * Max tokens for the summary response.
   * Ignored when `summarizer` is provided.
   * @default 2048
   */
  maxSummaryTokens?: number;

  /**
   * Whether to truncate large tool results on ContextWindowOverflowError
   * before falling back to summarization.
   * @default true
   */
  shouldTruncateResults?: boolean;

  /**
   * Key used to store the latest summary in agent.state.
   * Set to null to disable state storage.
   * @default 'conversationSummary'
   */
  summaryStateKey?: string | null;

  /**
   * Marker string used to identify summary messages in the conversation.
   * The manager uses this to detect and replace existing summaries.
   * @default '[CONVERSATION_SUMMARY]'
   */
  summaryMarker?: string;

  /**
   * Callback invoked after a summary is generated.
   * Useful for logging, metrics, or external persistence.
   */
  onSummaryGenerated?: (summary: ConversationSummary) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Manager Interface (for testing / DI)
// ---------------------------------------------------------------------------

/**
 * Public interface of SummarizingConversationManager.
 *
 * Uses AgentData (not Agent) because hook events expose AgentData.
 * At runtime the object is always an Agent instance, so model access
 * is resolved via runtime property check.
 */
export interface ISummarizingConversationManager {
  /**
   * Orchestrate summarization + truncation on the message array.
   * Called internally by AfterInvocationEvent hook.
   *
   * @param messages - The agent's message array (modified in-place)
   * @param agent    - The agent data (messages + state)
   */
  applyManagement(messages: Message[], agent: AgentData): Promise<void>;

  /**
   * Generate a summary of the given messages using the configured summarizer.
   *
   * @param messagesToSummarize - Messages to summarize
   * @param agent               - Agent data (for model fallback via runtime check)
   * @param existingSummary     - Previous summary to incorporate
   * @returns Summary text
   */
  generateSummary(
    messagesToSummarize: Message[],
    agent: AgentData,
    existingSummary?: string | null
  ): Promise<string>;

  /**
   * Check if the first message(s) contain a summary from a previous cycle.
   *
   * @param messages - Current message array
   * @returns The existing summary text, or null
   */
  extractExistingSummary(messages: Message[]): string | null;

  /**
   * Create a [user, assistant] message pair containing the summary.
   * The user message contains the summary text; the assistant message
   * acknowledges it. This pair is prepended to the conversation.
   *
   * @param summaryText - The generated summary
   * @returns Tuple of [userMessage, assistantMessage]
   */
  createSummaryMessagePair(summaryText: string): [Message, Message];

  /**
   * Trim oldest messages for context overflow recovery.
   * Falls back to SlidingWindow-style splice when summarization fails.
   *
   * @param messages - Message array (modified in-place)
   * @param error    - The overflow error that triggered reduction
   */
  reduceContext(messages: Message[], error?: Error): void;
}
