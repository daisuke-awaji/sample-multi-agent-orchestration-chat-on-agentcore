/**
 * Service for building event-driven system prompts
 * Prepends event context information to agent's original system prompt
 */

import { EventDrivenContext } from '../types/index.js';

/**
 * Build event-driven system prompt by combining event context with agent's instructions
 * @param agentSystemPrompt - Original system prompt from agent configuration
 * @param context - Event-driven context information
 * @returns Combined system prompt with event context prepended
 */
export function buildEventDrivenSystemPrompt(
  agentSystemPrompt: string,
  context: EventDrivenContext
): string {
  const eventContextSection = formatEventContext(context);
  return `${eventContextSection}\n\n---\n\n## Agent Instructions\n\n${agentSystemPrompt}`;
}

/**
 * Format event context into markdown section
 * @param context - Event-driven context
 * @returns Formatted markdown string
 */
function formatEventContext(context: EventDrivenContext): string {
  return `## Event-Driven Execution Context

This agent is being invoked automatically in response to an event. No human user is waiting in real-time.

### Execution Information

| Field | Value |
|-------|-------|
| Trigger | ${context.triggerName || context.triggerId} |
| Execution Time | ${context.executionTime} |
| Event Source | ${context.eventBridge.source} |
| Event Type | ${context.eventBridge.detailType} |
| Region | ${context.eventBridge.region} |
| Event ID | ${context.eventBridge.id} |

### Event Payload

\`\`\`json
${formatEventDetail(context.eventDetail)}
\`\`\`

### Guidelines for Event-Driven Execution

- Complete the assigned task thoroughly
- Document results and findings clearly
- Handle errors gracefully with explicit logging
- Do not ask clarifying questions - make reasonable assumptions and proceed
- Focus on reliability over speed`.trim();
}

/**
 * Format event detail as pretty-printed JSON
 * @param eventDetail - Event detail object
 * @returns Formatted JSON string
 */
function formatEventDetail(eventDetail: Record<string, unknown>): string {
  try {
    return JSON.stringify(eventDetail, null, 2);
  } catch (error) {
    console.error('Failed to stringify event detail:', error);
    return JSON.stringify({ error: 'Failed to serialize event detail' });
  }
}
