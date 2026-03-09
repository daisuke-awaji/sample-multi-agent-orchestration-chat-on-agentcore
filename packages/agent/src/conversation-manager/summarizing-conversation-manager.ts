/**
 * SummarizingConversationManager
 *
 * A conversation manager that summarizes old messages before removing them,
 * preserving context that SlidingWindowConversationManager would discard.
 *
 * ## Flow
 *
 * ```
 * AfterInvocationEvent
 *   │
 *   ▼
 * messages.length > windowSize?
 *   │ No → return
 *   │ Yes
 *   ▼
 * extractExistingSummary()   ← detect prior summary pair at head
 *   │
 *   ▼
 * partition messages:
 *   [summaryPair?] [toSummarize...] [toKeep (targetSize)]
 *   │
 *   ▼
 * generateSummary(toSummarize, existingSummary)
 *   │
 *   ▼
 * splice messages → [newSummaryPair] + [toKeep]
 *   │
 *   ▼
 * store summary in agent.state
 * invoke onSummaryGenerated callback
 * ```
 *
 * ## Error Recovery (AfterModelCallEvent + ContextWindowOverflowError)
 *
 * 1. Try truncating large tool results (same as SlidingWindow)
 * 2. If that fails, fall back to SlidingWindow-style splice (no summarization)
 *    - Summarization is async and may itself exceed the context window
 *    - Synchronous fallback ensures recovery
 */

import {
  Message,
  ContextWindowOverflowError,
  AfterInvocationEvent,
  AfterModelCallEvent,
} from '@strands-agents/sdk';
import type { HookProvider } from '@strands-agents/sdk/dist/src/hooks/types.js';
import type { HookRegistryImplementation as HookRegistry } from '@strands-agents/sdk/dist/src/hooks/registry.js';
import type { AgentData } from '@strands-agents/sdk/dist/src/types/agent.js';
import type { Model, BaseModelConfig } from '@strands-agents/sdk/dist/src/models/model.js';
import type {
  SummarizingConversationManagerConfig,
  ConversationSummarizer,
  ConversationSummary,
  ISummarizingConversationManager,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WINDOW_SIZE = 40;
const DEFAULT_MAX_SUMMARY_TOKENS = 2048;
const DEFAULT_SUMMARY_MARKER = '[CONVERSATION_SUMMARY]';
const DEFAULT_SUMMARY_STATE_KEY = 'conversationSummary';

/** Default prompt used by ModelBasedSummarizer. */
export const DEFAULT_SUMMARY_PROMPT = `You are a conversation summarizer. Your task is to create a concise but comprehensive summary of the conversation history provided.

Instructions:
- Capture key facts, decisions, and action items
- Preserve important names, numbers, and technical details
- Note any ongoing tasks or unresolved questions
- Maintain the chronological flow of the conversation
- If a previous summary is provided, incorporate it into your new summary
- Keep the summary under 500 words
- Write in the same language as the conversation
- Do NOT include any preamble like "Here is a summary..." — start directly with the content`;

// ---------------------------------------------------------------------------
// ModelBasedSummarizer (default strategy)
// ---------------------------------------------------------------------------

/**
 * Built-in summarizer that uses a Bedrock/Strands model to generate summaries.
 *
 * Resolves the model lazily: if no model is provided in config, it attempts
 * to use the agent's model at runtime (accessed via runtime property check on AgentData).
 */
export class ModelBasedSummarizer implements ConversationSummarizer {
  private readonly _model?: Model<BaseModelConfig>;
  private readonly _prompt: string;
  private readonly _maxTokens: number;

  constructor(config?: { model?: Model<BaseModelConfig>; prompt?: string; maxTokens?: number }) {
    this._model = config?.model;
    this._prompt = config?.prompt ?? DEFAULT_SUMMARY_PROMPT;
    this._maxTokens = config?.maxTokens ?? DEFAULT_MAX_SUMMARY_TOKENS;
  }

  async summarize(
    _messagesToSummarize: Message[],
    _existingSummary: string | null
  ): Promise<string> {
    // TODO: Implement — call model with messages formatted as conversation text
    throw new Error('Not implemented');
  }

  /**
   * Resolve which model to use.
   * Tries: explicit config model → agent's model (runtime check) → error.
   */
  resolveModel(agent?: AgentData): Model<BaseModelConfig> {
    if (this._model) return this._model;

    // At runtime, AgentData is actually an Agent instance which has .model
    const agentModel = (agent as unknown as Record<string, unknown>)?.model as
      | Model<BaseModelConfig>
      | undefined;
    if (agentModel) return agentModel;

    throw new Error(
      'No model available for summarization. Provide summaryModel in config or ensure agent has a model.'
    );
  }

  get prompt(): string {
    return this._prompt;
  }

  get maxTokens(): number {
    return this._maxTokens;
  }
}

// ---------------------------------------------------------------------------
// SummarizingConversationManager
// ---------------------------------------------------------------------------

/**
 * Conversation manager that summarizes truncated messages before removal.
 *
 * Implements HookProvider for SDK integration (same pattern as SlidingWindowConversationManager).
 * All core methods are public for testability.
 */
export class SummarizingConversationManager
  implements HookProvider, ISummarizingConversationManager
{
  private readonly _windowSize: number;
  private readonly _targetSize: number;
  private readonly _summarizer: ConversationSummarizer;
  private readonly _shouldTruncateResults: boolean;
  private readonly _summaryMarker: string;
  private readonly _summaryStateKey: string | null;
  private readonly _onSummaryGenerated?: (summary: ConversationSummary) => void | Promise<void>;

  constructor(config?: SummarizingConversationManagerConfig) {
    this._windowSize = config?.windowSize ?? DEFAULT_WINDOW_SIZE;
    this._shouldTruncateResults = config?.shouldTruncateResults ?? true;
    this._summaryMarker = config?.summaryMarker ?? DEFAULT_SUMMARY_MARKER;
    this._summaryStateKey =
      config?.summaryStateKey === undefined ? DEFAULT_SUMMARY_STATE_KEY : config.summaryStateKey;
    this._onSummaryGenerated = config?.onSummaryGenerated;

    // targetSize: default to half of windowSize, rounded down to even
    const rawTarget = config?.targetSize ?? Math.floor(this._windowSize / 2);
    this._targetSize = rawTarget % 2 === 0 ? rawTarget : rawTarget - 1;

    // Summarizer: custom > model-based with explicit model > model-based with agent fallback
    this._summarizer =
      config?.summarizer ??
      new ModelBasedSummarizer({
        model: config?.summaryModel,
        prompt: config?.summaryPrompt,
        maxTokens: config?.maxSummaryTokens,
      });
  }

  // -----------------------------------------------------------------------
  // HookProvider
  // -----------------------------------------------------------------------

  registerCallbacks(registry: HookRegistry): void {
    // After each invocation: apply summarization if threshold exceeded
    registry.addCallback(AfterInvocationEvent, async (event: AfterInvocationEvent) => {
      await this.applyManagement(event.agent.messages, event.agent);
    });

    // On context overflow: synchronous fallback (truncate results → splice)
    registry.addCallback(AfterModelCallEvent, (event: AfterModelCallEvent) => {
      if (event.error instanceof ContextWindowOverflowError) {
        this.reduceContext(event.agent.messages, event.error);
        event.retryModelCall = true;
      }
    });
  }

  // -----------------------------------------------------------------------
  // Core: applyManagement
  // -----------------------------------------------------------------------

  async applyManagement(messages: Message[], _agent: AgentData): Promise<void> {
    if (messages.length <= this._windowSize) {
      return;
    }

    // TODO: Implement
    // 1. extractExistingSummary(messages)
    // 2. Partition: [summaryPair?] [toSummarize] [toKeep(targetSize)]
    // 3. generateSummary(toSummarize, agent, existingSummary)
    // 4. createSummaryMessagePair(summaryText)
    // 5. splice messages → [summaryPair, ...toKeep]
    // 6. Store in agent.state
    // 7. Invoke callback
    throw new Error('Not implemented');
  }

  // -----------------------------------------------------------------------
  // Summary Generation
  // -----------------------------------------------------------------------

  async generateSummary(
    _messagesToSummarize: Message[],
    _agent: AgentData,
    _existingSummary?: string | null
  ): Promise<string> {
    // TODO: Implement — delegate to this._summarizer
    throw new Error('Not implemented');
  }

  // -----------------------------------------------------------------------
  // Summary Message Management
  // -----------------------------------------------------------------------

  extractExistingSummary(_messages: Message[]): string | null {
    // TODO: Implement — check if messages[0] contains the summary marker
    throw new Error('Not implemented');
  }

  createSummaryMessagePair(_summaryText: string): [Message, Message] {
    // TODO: Implement
    // Returns:
    //   user:      "[CONVERSATION_SUMMARY]\n{summaryText}\n[/CONVERSATION_SUMMARY]"
    //   assistant: "I understand the previous context..."
    throw new Error('Not implemented');
  }

  // -----------------------------------------------------------------------
  // Fallback: Context Reduction (synchronous, same as SlidingWindow)
  // -----------------------------------------------------------------------

  reduceContext(_messages: Message[], _error?: Error): void {
    // TODO: Implement — same logic as SlidingWindowConversationManager.reduceContext
    // 1. Try truncateToolResults if error is provided
    // 2. Fall back to splice
    throw new Error('Not implemented');
  }

  // -----------------------------------------------------------------------
  // Accessors (for testing)
  // -----------------------------------------------------------------------

  get windowSize(): number {
    return this._windowSize;
  }

  get targetSize(): number {
    return this._targetSize;
  }

  get summaryMarker(): string {
    return this._summaryMarker;
  }

  get summaryStateKey(): string | null {
    return this._summaryStateKey;
  }

  get summarizer(): ConversationSummarizer {
    return this._summarizer;
  }
}
