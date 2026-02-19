# @moca/trigger

Event-driven trigger Lambda for invoking AgentCore agents on schedule or events.

## Overview

This Lambda function handles EventBridge Scheduler events to automatically invoke Agent API endpoints. It supports:

- **Schedule Triggers**: Cron or rate-based schedules via EventBridge Scheduler
- **Event Triggers**: (Future) EventBridge Bus events from S3, Slack, etc.

## Architecture

```
EventBridge Scheduler → Trigger Lambda → Agent API (/invocations)
                            ↓
                     DynamoDB (execution history)
```

## Features

- ✅ EventBridge Scheduler integration
- ✅ Machine User authentication (Client Credentials flow)
- ✅ Agent API invocation with streaming support
- ✅ Execution history tracking in DynamoDB
- ✅ Comprehensive error handling and logging
- 🔜 Event-based triggers (S3, custom events)

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `AGENT_API_URL` | Agent API endpoint URL | Yes |
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID | Yes |
| `COGNITO_CLIENT_ID` | Machine User Client ID | Yes |
| `COGNITO_CLIENT_SECRET` | Machine User Client Secret | Yes |
| `TRIGGERS_TABLE_NAME` | DynamoDB table name | Yes |
| `AWS_REGION` | AWS Region | Yes |

## Event Payload

### EventBridge Scheduler Event

```json
{
  "version": "0",
  "id": "event-id",
  "detail-type": "Scheduled Event",
  "source": "aws.scheduler",
  "account": "123456789012",
  "time": "2024-01-15T00:00:00Z",
  "region": "us-east-1",
  "resources": ["arn:aws:scheduler:..."],
  "detail": {
    "triggerId": "trigger-123",
    "userId": "user-456",
    "agentId": "agent-789",
    "prompt": "Execute daily task",
    "sessionId": "session-abc",
    "modelId": "anthropic.claude-3-sonnet-20240229-v1:0",
    "enabledTools": ["s3-list-files", "execute-command"]
  }
}
```

## Development

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Run Tests

```bash
npm test
```

### Local Development

```bash
npm run dev
```

## Deployment

This package is deployed as an AWS Lambda function via CDK. See `packages/cdk` for infrastructure configuration.

## Service Components

### AuthService

Handles Machine User authentication with Cognito.

```typescript
import { AuthService } from './services/auth-service.js';

const authService = AuthService.fromEnvironment();
const token = await authService.getMachineUserToken();
```

### AgentInvoker

Invokes Agent API with authentication.

```typescript
import { AgentInvoker } from './services/agent-invoker.js';

const invoker = AgentInvoker.fromEnvironment();
const response = await invoker.invoke(payload, authToken);
```

### ExecutionRecorder

Records execution history in DynamoDB.

```typescript
import { ExecutionRecorder } from './services/execution-recorder.js';

const recorder = ExecutionRecorder.fromEnvironment();
const executionId = await recorder.startExecution(triggerId, userId);
await recorder.completeExecution(triggerId, executionId, requestId);
```

## Error Handling

The Lambda function handles errors at multiple levels:

1. **Service Initialization Errors**: Fails fast if environment variables are missing
2. **Execution Record Errors**: Returns 500 if unable to create execution record
3. **Authentication Errors**: Logged and recorded in execution history
4. **Agent API Errors**: Captured from streaming response and recorded
5. **Unexpected Errors**: Caught and recorded with full error details

All errors are logged to CloudWatch Logs and recorded in DynamoDB execution history.

## Execution History

Execution records are stored in DynamoDB with the following structure:

```typescript
{
  PK: "TRIGGER#{triggerId}",
  SK: "EXECUTION#{executionId}",
  triggerId: string,
  executionId: string,
  userId: string,
  startedAt: string,
  completedAt?: string,
  status: "running" | "completed" | "failed",
  requestId?: string,
  sessionId?: string,
  error?: string,
  ttl: number  // Auto-cleanup after 30 days
}
```

## Future Enhancements

- [ ] Event-based triggers (EventBridge Bus)
- [ ] Retry logic with exponential backoff
- [ ] Dead letter queue for failed invocations
- [ ] CloudWatch metrics and alarms
- [ ] SNS notifications for failures
- [ ] Batch execution support

## License

MIT
