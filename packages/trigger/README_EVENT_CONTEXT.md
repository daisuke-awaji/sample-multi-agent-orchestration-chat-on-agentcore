# Event-Driven System Prompt Feature

## Overview

This feature enhances the Trigger Lambda to automatically prepend event context information to the agent's system prompt when invoking agents through EventBridge events. This allows agents to understand that they are being invoked in an event-driven manner and provides them with all relevant event metadata.

## Architecture

### Components

1. **EventDrivenContext Type** (`types/index.ts`)
   - Generic, schema-less structure supporting any EventBridge event
   - Contains execution metadata and EventBridge standard fields
   - Includes arbitrary event detail payload

2. **Prompt Builder Service** (`services/prompt-builder.ts`)
   - `buildEventDrivenSystemPrompt()` - Main function to combine event context with agent's system prompt
   - Formats event context into structured markdown
   - Pretty-prints event payload as JSON

3. **AgentInvoker Updates** (`services/agent-invoker.ts`)
   - Updated `invoke()` method to accept optional `EventDrivenContext`
   - Conditionally builds enhanced system prompt when context is provided
   - Maintains backward compatibility (context is optional)

4. **Schedule Handler Updates** (`handlers/schedule-handler.ts`)
   - Constructs `EventDrivenContext` from EventBridge Scheduler event
   - Passes context to `AgentInvoker.invoke()`

## System Prompt Structure

When an agent is invoked with event context, the system prompt is structured as follows:

```markdown
## Event-Driven Execution Context

This agent is being invoked automatically in response to an event. No human user is waiting in real-time.

### Execution Information

| Field | Value |
|-------|-------|
| Trigger | {triggerName or triggerId} |
| Execution Time | {ISO 8601 timestamp} |
| Event Source | {event source, e.g., "aws.scheduler"} |
| Event Type | {detail-type} |
| Region | {AWS region} |
| Event ID | {unique event ID} |

### Event Payload

```json
{
  // Complete event detail in pretty-printed JSON
}
```

### Guidelines for Event-Driven Execution

- Complete the assigned task thoroughly
- Document results and findings clearly
- Handle errors gracefully with explicit logging
- Do not ask clarifying questions - make reasonable assumptions and proceed
- Focus on reliability over speed

---

## Agent Instructions

{Original agent system prompt from DynamoDB}
```

## Usage

### For Schedule Events

The system automatically constructs and passes event context:

```typescript
// In schedule-handler.ts
const eventContext: EventDrivenContext = {
  triggerId,
  executionTime: new Date().toISOString(),
  eventBridge: {
    id: event.id,
    source: event.source,
    detailType: event['detail-type'],
    account: event.account,
    region: event.region,
    time: event.time,
    resources: event.resources,
  },
  eventDetail: payload as unknown as Record<string, unknown>,
};

const invocationResponse = await agentInvoker.invoke(
  payload,
  tokenResponse.accessToken,
  eventContext  // ← Event context passed here
);
```

### For Future Event Sources (Slack, GitHub, etc.)

The generic structure supports any EventBridge event:

```typescript
// Example: Slack event handler (future implementation)
const eventContext: EventDrivenContext = {
  triggerId: 'slack-trigger-123',
  triggerName: 'Slack Channel Monitor',
  executionTime: new Date().toISOString(),
  eventBridge: {
    id: event.id,
    source: 'custom.slack.integration',
    detailType: 'Message Posted',
    account: event.account,
    region: event.region,
    time: event.time,
    resources: [],
  },
  eventDetail: {
    channel: '#engineering',
    user: 'john.doe',
    text: 'Please analyze this data',
    threadTs: '1234567890.123456',
    // ... any other Slack-specific fields
  },
};
```

## Benefits

1. **Context Awareness**: Agents understand they are running in automated mode
2. **Schema-less**: No need to define source-specific interfaces for each event type
3. **Future-Proof**: Easily supports new event sources (Slack, GitHub, HTTP webhooks, etc.)
4. **Debugging**: Event details are visible in the agent's context
5. **Behavioral Guidance**: Agents receive guidelines for automated execution

## Testing

Unit tests are provided in `__tests__/prompt-builder.test.ts`:

```bash
cd packages/trigger
npm test -- prompt-builder.test.ts
```

Tests cover:
- ✅ Event context prepending
- ✅ Trigger information inclusion
- ✅ EventBridge metadata formatting
- ✅ JSON payload pretty-printing
- ✅ Execution guidelines
- ✅ Complex nested structures
- ✅ Markdown formatting

## Migration Guide

### Existing Deployments

This feature is **backward compatible**:

- The `eventContext` parameter is optional in `AgentInvoker.invoke()`
- If not provided, agents receive their original system prompt unchanged
- Existing invocations continue to work without modification

### Enabling Event Context

Event context is automatically enabled for:
- ✅ EventBridge Scheduler events (already implemented)
- 🔜 Future: Custom EventBridge Rules (when cdk.json configuration is added)
- 🔜 Future: Slack integration
- 🔜 Future: GitHub webhooks
- 🔜 Future: HTTP webhooks

## Example Output

For a schedule event, the agent receives:

```markdown
## Event-Driven Execution Context

This agent is being invoked automatically in response to an event. No human user is waiting in real-time.

### Execution Information

| Field | Value |
|-------|-------|
| Trigger | Daily Report Generator |
| Execution Time | 2026-01-17T00:00:00Z |
| Event Source | aws.scheduler |
| Event Type | Scheduled Event |
| Region | ap-northeast-1 |
| Event ID | event-abc-123 |

### Event Payload

```json
{
  "triggerId": "epB5aPbTjrFGymD3ws9q3",
  "userId": "47547a38-70e1-7026-e25f-bbdc98c68d68",
  "agentId": "43a0a96c-8bc0-4e4f-8a2c-530d02af79d4",
  "prompt": "Generate today's sales report"
}
```

### Guidelines for Event-Driven Execution

- Complete the assigned task thoroughly
- Document results and findings clearly
- Handle errors gracefully with explicit logging
- Do not ask clarifying questions - make reasonable assumptions and proceed
- Focus on reliability over speed

---

## Agent Instructions

You are a business analyst assistant. Generate comprehensive daily reports...
```

## Files Modified

- `packages/trigger/src/types/index.ts` - Added `EventDrivenContext` type
- `packages/trigger/src/services/prompt-builder.ts` - New service for prompt building
- `packages/trigger/src/services/agent-invoker.ts` - Updated to use event context
- `packages/trigger/src/handlers/schedule-handler.ts` - Constructs and passes context
- `packages/trigger/src/index.ts` - Export prompt builder
- `packages/trigger/src/__tests__/prompt-builder.test.ts` - New unit tests

## Future Enhancements

1. **Multi-language Support**: Translate event context section based on agent configuration
2. **Templating**: Allow custom event context templates per trigger type
3. **Filtering**: Option to exclude sensitive fields from event detail
4. **Compression**: Truncate large event payloads with link to full detail
5. **Rich Formatting**: Add tables, charts, or other visualizations for complex event data
