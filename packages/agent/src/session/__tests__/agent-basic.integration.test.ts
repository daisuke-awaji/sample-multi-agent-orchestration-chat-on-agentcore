/**
 * Agent Basic Integration Tests
 *
 * Verifies core Agent functionality with actual Bedrock API calls:
 * system prompt adherence, streaming, prompt caching, multi-turn memory.
 *
 * Run: cd packages/agent && npm run test:integration -- agent-basic
 */

import { describe, it, expect } from '@jest/globals';
import { Agent, SlidingWindowConversationManager } from '@strands-agents/sdk';
import { createBedrockModel } from '../../models/bedrock.js';

/** Extract text from a message's content blocks (inline to keep tests self-contained). */
function textOf(message: { content: unknown[] }): string {
  return message.content
    .filter((b) => (b as { type: string }).type === 'textBlock')
    .map((b) => (b as { text?: string }).text || '')
    .join('');
}

/** Collect usage metrics from modelMetadataEvent in a stream. */
async function streamAndCollectUsage(
  agent: Agent,
  prompt: string
): Promise<{
  inputTokens: number;
  outputTokens: number;
  cacheWriteInputTokens: number;
  cacheReadInputTokens: number;
}> {
  let usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteInputTokens: 0,
    cacheReadInputTokens: 0,
  };
  for await (const event of agent.stream(prompt)) {
    const e = event as { type?: string; usage?: Record<string, number> };
    if (e.type === 'modelMetadataEvent' && e.usage) {
      usage = {
        inputTokens: e.usage.inputTokens || 0,
        outputTokens: e.usage.outputTokens || 0,
        cacheWriteInputTokens: e.usage.cacheWriteInputTokens || 0,
        cacheReadInputTokens: e.usage.cacheReadInputTokens || 0,
      };
    }
  }
  return usage;
}

describe('Agent Basic', () => {
  describe('system prompt', () => {
    it('follows instructions to respond with PONG', async () => {
      // Arrange
      const agent = new Agent({
        model: createBedrockModel(),
        systemPrompt:
          'Always respond with exactly the word "PONG" when the user says "PING". No other text.',
        tools: [],
        conversationManager: new SlidingWindowConversationManager({ windowSize: 20 }),
      });

      // Act
      for await (const event of agent.stream('PING')) {
        void event;
      }

      // Assert
      expect(textOf(agent.messages[agent.messages.length - 1]).toUpperCase()).toContain('PONG');
    });
  });

  describe('streaming', () => {
    it('delivers events and builds user + assistant messages', async () => {
      // Arrange
      const agent = new Agent({
        model: createBedrockModel(),
        systemPrompt: 'Be very brief.',
        tools: [],
        conversationManager: new SlidingWindowConversationManager({ windowSize: 20 }),
      });

      // Act
      const events: unknown[] = [];
      for await (const event of agent.stream('What is the capital of Japan? One word.')) {
        events.push(event);
      }

      // Assert — received stream events
      expect(events.length).toBeGreaterThan(0);
      // Assert — 2 messages: user, assistant
      expect(agent.messages).toHaveLength(2);
      expect(agent.messages[0].role).toBe('user');
      expect(agent.messages[1].role).toBe('assistant');
      // Assert — correct answer
      expect(textOf(agent.messages[1]).toLowerCase()).toContain('tokyo');
    });
  });

  describe('prompt caching', () => {
    it('responds correctly across two turns with caching enabled', async () => {
      // Arrange
      const agent = new Agent({
        model: createBedrockModel({ cachePrompt: 'default', cacheTools: 'default' }),
        systemPrompt: 'Be brief.',
        tools: [],
        conversationManager: new SlidingWindowConversationManager({ windowSize: 20 }),
      });

      // Act — turn 1
      for await (const event of agent.stream('What is 3 + 5? Just the number.')) {
        void event;
      }
      // Act — turn 2 (benefits from cached system prompt)
      for await (const event of agent.stream('What is 10 + 20? Just the number.')) {
        void event;
      }

      // Assert
      expect(agent.messages).toHaveLength(4); // user, assistant, user, assistant
      expect(textOf(agent.messages[1])).toContain('8');
      expect(textOf(agent.messages[3])).toContain('30');
    });

    it('responds correctly across 5 turns with a long system prompt and caching', async () => {
      // Arrange — long system prompt to maximize cache benefit
      const longSystemPrompt =
        'You are an expert financial analyst assistant. ' +
        'You analyze stock markets, bonds, derivatives, and complex financial instruments. ' +
        'You provide detailed analysis with precise numbers and percentages. ' +
        'Always respond in a structured format. Use professional financial terminology. ' +
        'When discussing risk, categorize it as Low, Medium, or High. ' +
        'Format all currency values with two decimal places. ' +
        'Provide both bull and bear case scenarios for any investment thesis. '.repeat(5) +
        'Despite all these instructions, when asked a simple arithmetic question, just answer with the number.';

      const agent = new Agent({
        model: createBedrockModel({ cachePrompt: 'default' }),
        systemPrompt: longSystemPrompt,
        tools: [],
        conversationManager: new SlidingWindowConversationManager({ windowSize: 20 }),
      });

      // Act — 5 turns with arithmetic questions
      const questions = ['1+1', '2+3', '4+6', '7+8', '10+20'];
      const expectedAnswers = ['2', '5', '10', '15', '30'];
      const usagePerTurn: { cacheWrite: number; cacheRead: number }[] = [];

      for (const q of questions) {
        const usage = await streamAndCollectUsage(agent, `What is ${q}? Just the number.`);
        usagePerTurn.push({
          cacheWrite: usage.cacheWriteInputTokens,
          cacheRead: usage.cacheReadInputTokens,
        });
      }

      // Log cache metrics for debugging (cache may or may not be visible at SDK stream level)
      console.log('Cache metrics per turn:', usagePerTurn);

      // Assert — all 5 turns produced correct answers (10 messages total)
      expect(agent.messages).toHaveLength(10);
      for (let i = 0; i < expectedAnswers.length; i++) {
        expect(textOf(agent.messages[i * 2 + 1])).toContain(expectedAnswers[i]);
      }
    });

    it('does not use cache when caching is disabled', async () => {
      // Arrange — create a model without cache options
      const { BedrockModel } = await import('@strands-agents/sdk');
      const noCacheModel = new BedrockModel({
        region: process.env.BEDROCK_REGION || 'us-east-1',
        modelId: process.env.BEDROCK_MODEL_ID || 'global.anthropic.claude-sonnet-4-6',
        // No cachePrompt, no cacheTools → caching disabled
        clientConfig: { retryMode: 'adaptive' as const, maxAttempts: 5 },
      });

      const agent = new Agent({
        model: noCacheModel,
        systemPrompt: 'Be brief.',
        tools: [],
        conversationManager: new SlidingWindowConversationManager({ windowSize: 20 }),
      });

      // Act
      const usage = await streamAndCollectUsage(agent, 'What is 7 + 8? Just the number.');
      console.log('No-cache usage:', usage);

      // Assert — no cache write or read
      expect(usage.cacheWriteInputTokens).toBe(0);
      expect(usage.cacheReadInputTokens).toBe(0);

      // Assert — still responds correctly
      expect(textOf(agent.messages[1])).toContain('15');
    });

    it('rejects whitespace-only prompt with a validation error', async () => {
      // Arrange
      const agent = new Agent({
        model: createBedrockModel(),
        systemPrompt: 'Be brief.',
        tools: [],
        conversationManager: new SlidingWindowConversationManager({ windowSize: 20 }),
      });

      // Act & Assert — Bedrock rejects whitespace-only text content
      let caughtError: Error | undefined;
      try {
        for await (const event of agent.stream(' ')) {
          void event;
        }
      } catch (error) {
        caughtError = error as Error;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError!.message).toMatch(/non-whitespace|ValidationException/i);
    });
  });

  describe('multi-turn conversation', () => {
    it('remembers context from previous turns', async () => {
      // Arrange
      const agent = new Agent({
        model: createBedrockModel(),
        systemPrompt: 'Be very brief.',
        tools: [],
        conversationManager: new SlidingWindowConversationManager({ windowSize: 20 }),
      });

      // Act — establish context, then ask about it
      for await (const event of agent.stream('My name is Alice.')) {
        void event;
      }
      for await (const event of agent.stream('What is my name?')) {
        void event;
      }

      // Assert
      expect(agent.messages).toHaveLength(4);
      expect(textOf(agent.messages[3]).toLowerCase()).toContain('alice');
    });
  });
});
