/**
 * Unit tests for prompt-builder service
 */

import { describe, test, expect } from '@jest/globals';
import { buildEventDrivenSystemPrompt } from '../services/prompt-builder.js';
import { EventDrivenContext } from '../types/index.js';

describe('buildEventDrivenSystemPrompt', () => {
  const mockContext: EventDrivenContext = {
    triggerId: 'test-trigger-123',
    triggerName: 'Daily Report Generator',
    executionTime: '2026-01-17T00:00:00Z',
    eventBridge: {
      id: 'event-abc-123',
      source: 'aws.scheduler',
      detailType: 'Scheduled Event',
      account: '123456789012',
      region: 'ap-northeast-1',
      time: '2026-01-17T00:00:00Z',
      resources: [],
    },
    eventDetail: {
      userId: 'user-123',
      agentId: 'agent-456',
      prompt: 'Generate daily report',
    },
  };

  const originalSystemPrompt = 'You are a helpful assistant. Follow these instructions carefully.';

  test('should prepend event context to original system prompt', () => {
    const result = buildEventDrivenSystemPrompt(originalSystemPrompt, mockContext);

    // Check that original prompt is included
    expect(result).toContain(originalSystemPrompt);

    // Check that event context section is included
    expect(result).toContain('## Event-Driven Execution Context');
    expect(result).toContain('## Agent Instructions');
  });

  test('should include trigger information in context', () => {
    const result = buildEventDrivenSystemPrompt(originalSystemPrompt, mockContext);

    expect(result).toContain('Daily Report Generator');
    expect(result).toContain('2026-01-17T00:00:00Z');
    // Note: trigger ID is not shown separately when trigger name is present
  });

  test('should include EventBridge metadata', () => {
    const result = buildEventDrivenSystemPrompt(originalSystemPrompt, mockContext);

    expect(result).toContain('aws.scheduler');
    expect(result).toContain('Scheduled Event');
    expect(result).toContain('ap-northeast-1');
    expect(result).toContain('event-abc-123');
  });

  test('should include event detail as JSON', () => {
    const result = buildEventDrivenSystemPrompt(originalSystemPrompt, mockContext);

    expect(result).toContain('```json');
    expect(result).toContain('"userId": "user-123"');
    expect(result).toContain('"agentId": "agent-456"');
    expect(result).toContain('"prompt": "Generate daily report"');
  });

  test('should include execution guidelines', () => {
    const result = buildEventDrivenSystemPrompt(originalSystemPrompt, mockContext);

    expect(result).toContain('Guidelines for Event-Driven Execution');
    expect(result).toContain('Complete the assigned task thoroughly');
    expect(result).toContain('Do not ask clarifying questions');
  });

  test('should use triggerId when triggerName is not provided', () => {
    const contextWithoutName: EventDrivenContext = {
      ...mockContext,
      triggerName: undefined,
    };

    const result = buildEventDrivenSystemPrompt(originalSystemPrompt, contextWithoutName);

    expect(result).toContain('test-trigger-123');
  });

  test('should handle complex event detail structures', () => {
    const complexContext: EventDrivenContext = {
      ...mockContext,
      eventDetail: {
        nested: {
          object: {
            value: 'test',
          },
        },
        array: [1, 2, 3],
        boolean: true,
        null: null,
      },
    };

    const result = buildEventDrivenSystemPrompt(originalSystemPrompt, complexContext);

    expect(result).toContain('"nested"');
    expect(result).toContain('"array"');
    // Pretty-printed JSON splits array across multiple lines
    expect(result).toContain('1');
    expect(result).toContain('2');
    expect(result).toContain('3');
  });

  test('should properly separate sections with markdown', () => {
    const result = buildEventDrivenSystemPrompt(originalSystemPrompt, mockContext);

    // Check for proper section separation
    expect(result).toMatch(/---\s+## Agent Instructions/);
  });

  test('should handle empty event detail', () => {
    const contextWithEmptyDetail: EventDrivenContext = {
      ...mockContext,
      eventDetail: {},
    };

    const result = buildEventDrivenSystemPrompt(originalSystemPrompt, contextWithEmptyDetail);

    expect(result).toContain('```json');
    expect(result).toContain('{}');
  });
});
