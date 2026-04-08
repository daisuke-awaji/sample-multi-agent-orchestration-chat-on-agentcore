/**
 * Unit tests for stream-serializer utilities
 */

import { describe, it, expect } from '@jest/globals';
import { serializeStreamEvent } from '../stream-serializer.js';

describe('serializeStreamEvent', () => {
  describe('text generation events', () => {
    it('should serialize modelContentBlockDeltaEvent', () => {
      const event = {
        type: 'modelContentBlockDeltaEvent',
        delta: { text: 'Hello' },
        agent: { circular: 'reference' },
      };

      const result = serializeStreamEvent(event);

      expect(result).toEqual({
        type: 'modelContentBlockDeltaEvent',
        delta: { text: 'Hello' },
      });
      expect(result).not.toHaveProperty('agent');
    });

    it('should serialize modelContentBlockStartEvent', () => {
      const event = {
        type: 'modelContentBlockStartEvent',
        start: { contentBlockIndex: 0 },
      };

      const result = serializeStreamEvent(event);

      expect(result).toEqual({
        type: 'modelContentBlockStartEvent',
        start: { contentBlockIndex: 0 },
      });
    });

    it('should serialize modelContentBlockStopEvent', () => {
      const event = {
        type: 'modelContentBlockStopEvent',
        stop: { contentBlockIndex: 0 },
      };

      const result = serializeStreamEvent(event);

      expect(result).toEqual({
        type: 'modelContentBlockStopEvent',
        stop: { contentBlockIndex: 0 },
      });
    });
  });

  describe('message lifecycle events', () => {
    it('should serialize modelMessageStartEvent with message', () => {
      const event = {
        type: 'modelMessageStartEvent',
        message: {
          role: 'assistant',
          content: [],
          circular: { ref: 'should be removed' },
        },
      };

      const result = serializeStreamEvent(event);

      expect(result).toEqual({
        type: 'modelMessageStartEvent',
        message: {
          role: 'assistant',
          content: [],
        },
      });
    });

    it('should serialize modelMessageStartEvent without message', () => {
      const event = {
        type: 'modelMessageStartEvent',
      };

      const result = serializeStreamEvent(event);

      expect(result).toEqual({
        type: 'modelMessageStartEvent',
        message: undefined,
      });
    });

    it('should serialize modelMessageStopEvent', () => {
      const event = {
        type: 'modelMessageStopEvent',
        message: {
          role: 'assistant',
          content: [{ text: 'Hello' }],
        },
      };

      const result = serializeStreamEvent(event);

      expect(result).toEqual({
        type: 'modelMessageStopEvent',
        message: {
          role: 'assistant',
          content: [{ text: 'Hello' }],
        },
      });
    });

    it('should serialize messageAddedEvent', () => {
      const event = {
        type: 'messageAddedEvent',
        message: {
          role: 'user',
          content: [{ text: 'Hi' }],
        },
      };

      const result = serializeStreamEvent(event);

      expect(result).toEqual({
        type: 'messageAddedEvent',
        message: {
          role: 'user',
          content: [{ text: 'Hi' }],
        },
      });
    });
  });

  describe('metadata and result events', () => {
    it('should serialize modelMetadataEvent with usage', () => {
      const event = {
        type: 'modelMetadataEvent',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
        },
      };

      const result = serializeStreamEvent(event);

      expect(result).toEqual({
        type: 'modelMetadataEvent',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
        },
      });
    });

    it('should serialize modelMetadataEvent with cache metrics', () => {
      const event = {
        type: 'modelMetadataEvent',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheWriteInputTokens: 20,
          cacheReadInputTokens: 10,
        },
      };

      const result = serializeStreamEvent(event);

      expect(result).toEqual({
        type: 'modelMetadataEvent',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheWriteInputTokens: 20,
          cacheReadInputTokens: 10,
        },
      });
    });

    it('should serialize agentResult', () => {
      const event = {
        type: 'agentResult',
        result: { success: true, data: 'test' },
      };

      const result = serializeStreamEvent(event);

      expect(result).toEqual({
        type: 'agentResult',
        result: { success: true, data: 'test' },
      });
    });

    it('should serialize textBlock', () => {
      const event = {
        type: 'textBlock',
        text: 'Some text content',
      };

      const result = serializeStreamEvent(event);

      expect(result).toEqual({
        type: 'textBlock',
        text: 'Some text content',
      });
    });
  });

  describe('lifecycle events', () => {
    it('should serialize beforeInvocationEvent', () => {
      const event = {
        type: 'beforeInvocationEvent',
        someData: 'should be ignored',
      };

      const result = serializeStreamEvent(event);

      expect(result).toEqual({
        type: 'beforeInvocationEvent',
      });
    });

    it('should serialize afterInvocationEvent', () => {
      const event = { type: 'afterInvocationEvent' };
      const result = serializeStreamEvent(event);
      expect(result).toEqual({ type: 'afterInvocationEvent' });
    });

    it('should serialize afterToolsEvent', () => {
      const event = { type: 'afterToolsEvent' };
      const result = serializeStreamEvent(event);
      expect(result).toEqual({ type: 'afterToolsEvent' });
    });

    it('should serialize beforeModelCallEvent', () => {
      const event = { type: 'beforeModelCallEvent' };
      const result = serializeStreamEvent(event);
      expect(result).toEqual({ type: 'beforeModelCallEvent' });
    });

    it('should serialize beforeToolsEvent with message', () => {
      const event = {
        type: 'beforeToolsEvent',
        message: {
          role: 'assistant',
          content: [{ toolUse: { name: 'test' } }],
        },
      };

      const result = serializeStreamEvent(event);

      expect(result).toEqual({
        type: 'beforeToolsEvent',
        message: {
          role: 'assistant',
          content: [{ toolUse: { name: 'test' } }],
        },
      });
    });

    it('should serialize afterModelCallEvent with stopReason and stopData', () => {
      const event = {
        type: 'afterModelCallEvent',
        stopReason: 'end_turn',
        stopData: {
          message: { role: 'assistant', content: [] },
        },
      };

      const result = serializeStreamEvent(event);

      expect(result).toEqual({
        type: 'afterModelCallEvent',
        stopReason: 'end_turn',
        stopData: {
          message: { role: 'assistant', content: [] },
        },
      });
    });

    it('should serialize modelStreamEventHook with only type', () => {
      const event = {
        type: 'modelStreamEventHook',
        lots: 'of',
        extra: 'data',
      };

      const result = serializeStreamEvent(event);

      expect(result).toEqual({
        type: 'modelStreamEventHook',
      });
    });
  });

  describe('unknown events', () => {
    it('should return base event (type only) for unknown types', () => {
      const event = {
        type: 'unknownEventType',
        data: 'some data',
      };

      const result = serializeStreamEvent(event);

      // Unknown events return only the type (baseEvent)
      expect(result).toEqual({
        type: 'unknownEventType',
      });
    });

    it('should handle events without type property', () => {
      const event = { data: 'no type' };

      const result = serializeStreamEvent(event);

      expect(result).toHaveProperty('type', undefined);
    });
  });
});
