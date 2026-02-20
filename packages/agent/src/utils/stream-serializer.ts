/**
 * Streaming event serialization for Strands Agents
 * Safely serialize streaming events by extracting only necessary properties
 * from objects containing circular references
 */

import { logger } from '../config/index.js';

type EventObj = { type?: string; [key: string]: unknown };

/**
 * Extract {role, content} from a message field, returning undefined if absent
 */
function extractMessageFields(
  message: unknown
): { role: unknown; content: unknown } | undefined {
  if (!message) return undefined;
  return {
    role: (message as { role: unknown }).role,
    content: (message as { content: unknown }).content,
  };
}

const eventSerializers: Record<string, (eventObj: EventObj) => object> = {
  // Text generation events
  modelContentBlockDeltaEvent: (e) => ({ type: e.type, delta: e.delta }),
  modelContentBlockStartEvent: (e) => ({ type: e.type, start: e.start }),
  modelContentBlockStopEvent: (e) => ({ type: e.type, stop: e.stop }),

  // Message lifecycle events
  modelMessageStartEvent: (e) => ({ type: e.type, message: extractMessageFields(e.message) }),
  modelMessageStopEvent: (e) => ({ type: e.type, message: extractMessageFields(e.message) }),
  messageAddedEvent: (e) => ({ type: e.type, message: extractMessageFields(e.message) }),
  beforeToolsEvent: (e) => ({ type: e.type, message: extractMessageFields(e.message) }),

  // Metadata and result events
  modelMetadataEvent: (e) => {
    if (e.usage) {
      const usage = e.usage as {
        inputTokens?: number;
        outputTokens?: number;
        cacheWriteInputTokens?: number;
        cacheReadInputTokens?: number;
      };
      if (usage.cacheWriteInputTokens || usage.cacheReadInputTokens) {
        logger.info('📦 Cache metrics', {
          cacheWriteInputTokens: usage.cacheWriteInputTokens || 0,
          cacheReadInputTokens: usage.cacheReadInputTokens || 0,
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
        });
      }
    }
    return { type: e.type, usage: e.usage };
  },

  agentResult: (e) => ({ type: e.type, result: e.result }),

  // Text block events
  textBlock: (e) => ({ type: e.type, text: e.text }),

  // Stream hook events (lightweight due to frequent occurrence)
  modelStreamEventHook: (e) => ({ type: e.type }),

  // Existing lifecycle events (type only)
  beforeInvocationEvent: (e) => ({ type: e.type }),
  afterInvocationEvent: (e) => ({ type: e.type }),
  afterToolsEvent: (e) => ({ type: e.type }),
  beforeModelCallEvent: (e) => ({ type: e.type }),

  afterModelCallEvent: (e) => ({
    type: e.type,
    stopReason: e.stopReason,
    stopData: e.stopData
      ? { message: (e.stopData as { message: unknown }).message }
      : undefined,
  }),
};

/**
 * Safely serialize Strands Agents streaming events
 * Extract only necessary properties from objects containing circular references
 */
export function serializeStreamEvent(event: unknown): object {
  const eventObj = event as EventObj;
  const serializer = eventObj.type ? eventSerializers[eventObj.type] : undefined;

  if (serializer) {
    return serializer(eventObj);
  }

  // Show warning only for truly unknown event types
  logger.warn('New unknown streaming event:', { type: eventObj.type });
  return { type: eventObj.type };
}
