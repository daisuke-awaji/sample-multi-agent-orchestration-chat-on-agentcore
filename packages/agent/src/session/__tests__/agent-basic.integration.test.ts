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
