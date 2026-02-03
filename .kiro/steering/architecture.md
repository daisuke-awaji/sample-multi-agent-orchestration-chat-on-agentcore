# Software Architecture

## Architectural Patterns

### Overall Architecture
- **Pattern**: Serverless microservices with event-driven communication
- **Style**: Layered architecture with clear separation of concerns
- **Communication**: REST APIs, WebSocket (AppSync Events), DynamoDB Streams

### Agent Runtime Architecture
- **Framework**: Strands Agents SDK (@strands-agents/sdk)
- **Pattern**: Agent-Tool-Model orchestration
- **Tool Integration**: 
  - Local tools (built-in TypeScript functions)
  - AgentCore Gateway tools (via MCP protocol)
  - User-defined MCP servers (stdio, HTTP, SSE transports)

### Session Management
- **Short-term Memory**: AgentCore Memory (conversation history)
- **Long-term Memory**: AgentCore Memory with semantic search
- **Storage**: DynamoDB for metadata, S3 for files
- **Real-time Updates**: DynamoDB Streams → Lambda → AppSync Events

## Key Design Patterns

### 1. Agent Creation Pattern
```typescript
// packages/agent/src/agent.ts
createAgent(hooks, options) → { agent, metadata }
```
- Parallel initialization: session history, Gateway tools, long-term memories
- Tool filtering and consolidation (local + Gateway + user MCP)
- System prompt generation with context injection
- Prompt caching with CachePointBlock for efficiency


### 2. MCP Client Pattern
```typescript
// packages/agent/src/mcp/client.ts
AgentCoreMCPClient
```
- **Retry Logic**: Exponential backoff with configurable retries
- **Error Handling**: Retryable vs non-retryable error detection
- **JWT Propagation**: Request context-based authentication forwarding
- **Pagination**: Automatic handling of tool list pagination

### 3. Session Storage Pattern
```typescript
// packages/agent/src/session/agentcore-memory-storage.ts
AgentCoreMemoryStorage implements SessionStorage
```
- **Event-based Storage**: Each message as separate AgentCore Memory event
- **Incremental Saves**: Only new messages saved (diff-based)
- **Payload Consolidation**: Multiple payloads per event merged into single message
- **Pagination**: Automatic handling of large conversation histories

### 4. Hook Provider Pattern
```typescript
// packages/agent/src/session/session-persistence-hook.ts
SessionPersistenceHook implements HookProvider
```
- **Lifecycle Hooks**: beforeTurn, afterTurn for automatic persistence
- **Workspace Sync**: S3 upload/download with .syncignore filtering
- **Metadata Tracking**: Session type, agent ID, storage path

### 5. State Management Pattern (Frontend)
```typescript
// packages/frontend/src/stores/chatStore.ts
Zustand store with session-scoped state
```
- **Session Isolation**: Separate state per session ID
- **Optimistic Updates**: Immediate UI updates before API confirmation
- **Streaming Support**: Real-time content accumulation with delta updates
- **Tool Execution Tracking**: Status updates (pending → completed)


## Data Flow Patterns

### 1. Agent Invocation Flow
```
User Request → Frontend
  ↓
Backend API (JWT auth)
  ↓
AgentCore Runtime (/invocations)
  ↓
Agent Creation (parallel):
  - Load session history (AgentCore Memory)
  - Fetch Gateway tools (MCP)
  - Retrieve long-term memories (semantic search)
  ↓
Agent Execution (Strands SDK)
  ↓
Tool Calls (if needed):
  - Local tools (direct execution)
  - Gateway tools (MCP protocol with JWT)
  - User MCP servers (stdio/HTTP/SSE)
  ↓
Response Streaming (SSE)
  ↓
Session Persistence (hooks):
  - Save to AgentCore Memory
  - Upload workspace to S3
  - Update DynamoDB metadata
  ↓
Real-time Updates:
  - DynamoDB Stream trigger
  - Lambda processor
  - AppSync Events publish
  - Frontend WebSocket subscription
```

### 2. Session Management Flow
```
Session Creation:
  Frontend → Backend API → DynamoDB (sessions table)
  
Session Updates (Real-time):
  Agent Runtime → AgentCore Memory (events)
  Backend API → DynamoDB (metadata update)
  DynamoDB Stream → Lambda → AppSync Events
  AppSync Events → Frontend (WebSocket)
  
Session Restoration:
  Frontend → Backend API → AgentCore Memory (list events)
  Convert events → messages → Frontend state
```


### 3. Agent Management Flow
```
Agent Creation:
  Frontend → Backend API → DynamoDB (agents table)
  - Generate UUID for agentId
  - Store configuration (systemPrompt, enabledTools, mcpConfig)
  - Set isShared flag (default: false)

Agent Sharing:
  Frontend → Backend API → DynamoDB (toggle isShared)
  - Update GSI (isShared-createdAt-index)
  - Enable organization-wide discovery

Agent Cloning:
  Frontend → Backend API → DynamoDB
  - Fetch shared agent (verify isShared=true)
  - Create new agent for target user
  - Copy configuration (systemPrompt, tools, scenarios)
```

### 4. Event-Driven Trigger Flow
```
Trigger Creation:
  Frontend → Backend API → DynamoDB (triggers table)
  Backend API → EventBridge Scheduler (create schedule)
  
Trigger Execution:
  EventBridge Scheduler → Trigger Lambda
  Trigger Lambda → Cognito (machine user auth)
  Trigger Lambda → AgentCore Runtime (with JWT)
  Runtime → Agent execution with trigger context
  
Custom Event Trigger:
  External System → EventBridge (custom event)
  EventBridge Rule → Trigger Lambda
  Trigger Lambda → Agent execution
```

## Component Responsibilities

### Agent Runtime (packages/agent)
**Primary Role**: Execute AI agents with tool orchestration

**Key Responsibilities**:
- Agent lifecycle management (creation, execution, cleanup)
- Session history restoration from AgentCore Memory
- Tool integration (local, Gateway, user MCP)
- Workspace synchronization (S3 upload/download)
- Real-time streaming response generation
- Prompt caching for performance optimization

**Critical Files**:
- `src/agent.ts` - Agent creation and configuration
- `src/app.ts` - Express server setup
- `src/handlers/invocations.ts` - Main invocation handler
- `src/mcp/client.ts` - Gateway MCP client
- `src/session/` - Session management and persistence

### Backend API (packages/backend)
**Primary Role**: Business logic and data management

**Key Responsibilities**:
- JWT authentication and authorization
- Agent CRUD operations (create, read, update, delete, share)
- Session metadata management
- File storage operations (presigned URLs)
- Trigger management (schedule creation/deletion)
- MCP tool discovery and configuration

**Critical Files**:
- `src/index.ts` - Express app and routes
- `src/services/agents-service.ts` - Agent management
- `src/services/sessions-dynamodb.ts` - Session persistence
- `src/services/s3-storage.ts` - File operations
- `src/middleware/auth.ts` - JWT verification

### Frontend (packages/frontend)
**Primary Role**: User interface and state management

**Key Responsibilities**:
- User authentication (Cognito)
- Chat interface with streaming support
- Agent management UI (create, edit, share)
- File upload/download
- Real-time updates (AppSync Events WebSocket)
- Session history restoration

**Critical Files**:
- `src/stores/chatStore.ts` - Chat state management
- `src/stores/agentStore.ts` - Agent state
- `src/stores/sessionStore.ts` - Session list
- `src/api/agent.ts` - Agent API client
- `src/hooks/useAppSyncSubscription.ts` - Real-time updates

### CDK Infrastructure (packages/cdk)
**Primary Role**: AWS resource provisioning

**Key Responsibilities**:
- AgentCore Gateway and Runtime creation
- Cognito User Pool configuration
- DynamoDB table definitions
- S3 bucket setup with CORS
- Lambda function deployment
- AppSync Events API setup
- EventBridge Scheduler configuration

**Critical Files**:
- `lib/agentcore-stack.ts` - Main stack definition
- `lib/constructs/agentcore/` - AgentCore resources
- `lib/constructs/auth/` - Cognito setup
- `lib/constructs/storage/` - DynamoDB and S3
- `lib/constructs/triggers/` - Event-driven triggers


## Authentication & Authorization

### JWT Flow
```
1. User Login:
   Frontend → Cognito (username/password)
   Cognito → Frontend (ID Token + Access Token)

2. API Request:
   Frontend → Backend API (Authorization: Bearer <token>)
   Backend → JWKS verification (jose library)
   Backend → Extract user info (userId, username, groups)

3. Runtime Invocation:
   Backend → AgentCore Runtime (Authorization: Bearer <token>)
   Runtime → Request context storage (for tool calls)
   Runtime → Gateway MCP (JWT propagation)
```

### Machine User Authentication (Triggers)
```
Trigger Lambda → Cognito (CLIENT_CREDENTIALS flow)
Cognito → Trigger Lambda (Access Token)
Trigger Lambda → AgentCore Runtime (with token)
```

### Authorization Levels
- **Public Endpoints**: `/ping`, `/` (no auth)
- **User Endpoints**: `/agents`, `/sessions`, `/storage` (JWT required)
- **Admin Endpoints**: None (all users have equal access)
- **Gateway Tools**: JWT propagated from request context

## Error Handling Strategies

### Agent Runtime
- **Network Errors**: Retry with exponential backoff (MCP client)
- **Tool Errors**: Return error content to agent (non-blocking)
- **Session Errors**: Log and continue (graceful degradation)
- **Streaming Errors**: Send error message to frontend

### Backend API
- **Authentication Errors**: 401 Unauthorized
- **Authorization Errors**: 403 Forbidden
- **Validation Errors**: 400 Bad Request with details
- **Not Found**: 404 with helpful message
- **Server Errors**: 500 with sanitized message (hide internals in production)

### Frontend
- **API Errors**: Toast notifications with retry option
- **Streaming Errors**: Display in chat as error message
- **Network Errors**: Offline indicator with reconnect
- **State Errors**: Error boundaries with fallback UI

## Performance Optimizations

### Prompt Caching
- **Implementation**: CachePointBlock in session history
- **Benefit**: Reduce token processing for repeated context
- **Location**: Last message in history (before new turn)

### Parallel Operations
- **Agent Creation**: Concurrent fetching of session history, tools, memories
- **Tool Discovery**: Paginated Gateway tool list retrieval
- **Session Restoration**: Batch event fetching from AgentCore Memory

### Streaming Response
- **Protocol**: Server-Sent Events (SSE)
- **Chunking**: Text deltas, tool use, tool results
- **Frontend**: Incremental UI updates (no full re-render)

### Resource Optimization
- **Lambda**: Right-sized memory (agent: 2048MB, backend: 1024MB)
- **DynamoDB**: On-demand billing with GSI for queries
- **S3**: Lifecycle policies for old files
- **CloudFront**: CDN caching for frontend assets

## Security Considerations

### Data Protection
- **In Transit**: HTTPS/TLS for all communications
- **At Rest**: S3 encryption, DynamoDB encryption
- **Secrets**: AWS Secrets Manager for API keys
- **User Isolation**: userId-based data partitioning

### Access Control
- **Cognito**: User pool with email verification
- **JWT**: Short-lived tokens (1 hour default)
- **CORS**: Configured allowed origins
- **IAM**: Least privilege for Lambda roles

### Input Validation
- **Frontend**: Zod schemas for type safety
- **Backend**: Request validation before processing
- **Agent**: Tool input schema validation
- **File Upload**: Size limits, type restrictions

## Scalability Patterns

### Horizontal Scaling
- **Lambda**: Auto-scaling based on invocations
- **DynamoDB**: On-demand capacity mode
- **S3**: Unlimited storage
- **CloudFront**: Global edge locations

### Vertical Scaling
- **Lambda Memory**: Configurable per function
- **DynamoDB**: Adjustable read/write capacity
- **AgentCore**: Managed service (auto-scaling)

### Caching Strategies
- **Prompt Cache**: Bedrock-level caching
- **Tool List**: In-memory cache (10 min TTL)
- **Session State**: Frontend Zustand store
- **Static Assets**: CloudFront CDN

## Monitoring & Observability

### Logging
- **Agent Runtime**: Structured logging with context
- **Backend API**: Request/response logging
- **Lambda**: CloudWatch Logs with retention
- **Frontend**: Console errors (development only)

### Metrics
- **Agent Invocations**: Count, duration, errors
- **Tool Calls**: Success rate, latency
- **API Requests**: Throughput, error rate
- **DynamoDB**: Read/write capacity usage

### Tracing
- **Request ID**: Propagated through all layers
- **Session ID**: Tracks conversation context
- **User ID**: Links actions to users
- **Tool Use ID**: Tracks tool execution lifecycle


## Development Patterns

### Adding a New Tool

**Local Tool (Agent Runtime)**:
1. Create tool file in `packages/agent/src/tools/`
2. Define tool with Strands SDK:
   ```typescript
   import { tool } from '@strands-agents/sdk';
   import { z } from 'zod';
   
   export const myTool = tool({
     name: 'my_tool',
     description: 'Tool description',
     inputSchema: z.object({
       param: z.string().describe('Parameter description'),
     }),
     callback: async (input) => {
       // Tool implementation
       return 'Result';
     },
   });
   ```
3. Export from `packages/agent/src/tools/index.ts`
4. Tool auto-registered in agent creation

**Gateway Tool (Lambda)**:
1. Create Lambda in `packages/lambda-tools/tools/`
2. Define tool schema in `tool-schema.json`
3. Add Lambda target in CDK stack
4. Tool auto-discovered via Gateway MCP

### Adding a New API Endpoint

**Backend API**:
1. Create route handler in `packages/backend/src/routes/`
2. Add service logic in `packages/backend/src/services/`
3. Register route in `packages/backend/src/index.ts`:
   ```typescript
   import myRouter from './routes/my-route.js';
   app.use('/my-endpoint', myRouter);
   ```
4. Add API client in `packages/frontend/src/api/`

### Adding a New Agent Configuration

**Agent Management**:
1. Define agent schema in `packages/backend/src/services/agents-service.ts`
2. Update DynamoDB table schema if needed
3. Add UI form in `packages/frontend/src/components/AgentForm.tsx`
4. Update agent store in `packages/frontend/src/stores/agentStore.ts`

### Adding a New CDK Construct

**Infrastructure**:
1. Create construct in `packages/cdk/lib/constructs/`
2. Define props interface and construct class
3. Use in `packages/cdk/lib/agentcore-stack.ts`
4. Add CloudFormation outputs for important values

## Testing Strategies

### Unit Tests
- **Location**: `__tests__/` or `*.test.ts` alongside source
- **Framework**: Jest with ts-jest
- **Coverage**: Focus on business logic, utilities, converters
- **Mocking**: Mock AWS SDK, external APIs

### Integration Tests
- **Location**: `src/tests/*.integration.test.ts`
- **Scope**: End-to-end flows with real AWS services
- **Setup**: Test fixtures, cleanup in afterAll
- **Environment**: Separate test environment or local stack

### Manual Testing
- **Agent Sandbox**: Test agent in Bedrock console
- **Local Development**: Run services locally with Docker
- **Postman/curl**: API endpoint testing
- **Frontend**: Browser testing with dev tools

## Common Pitfalls & Solutions

### 1. Session State Mismatch
**Problem**: Frontend shows old messages after switching sessions
**Solution**: Use session-scoped state in chatStore, check activeSessionId before updates

### 2. JWT Expiration
**Problem**: API calls fail after token expires
**Solution**: Implement token refresh logic, handle 401 responses

### 3. Tool Call Timeout
**Problem**: Long-running tools cause timeout
**Solution**: Increase Lambda timeout, implement async tool pattern

### 4. Memory Pagination
**Problem**: Large conversation history causes slow loading
**Solution**: Implement cursor-based pagination, lazy loading

### 5. CORS Issues
**Problem**: Frontend can't call backend API
**Solution**: Configure CORS in backend, match frontend origin

### 6. MCP Server Errors
**Problem**: User-defined MCP servers fail to connect
**Solution**: Validate MCP config, provide clear error messages, retry logic

## Migration & Upgrade Patterns

### Database Schema Changes
1. Add new fields as optional
2. Deploy backend with backward compatibility
3. Migrate existing data (if needed)
4. Make fields required in next version

### API Version Management
- Use URL versioning: `/v1/agents`, `/v2/agents`
- Maintain old version during transition
- Deprecation notices in responses
- Remove old version after grace period

### Frontend Breaking Changes
- Feature flags for gradual rollout
- Backward compatible API changes
- Clear migration guide for users
- Rollback plan for critical issues

## Best Practices Summary

### Code Organization
- Keep related files together
- Use barrel exports (index.ts)
- Separate concerns (routes, services, models)
- Consistent naming conventions

### Error Handling
- Always catch and log errors
- Provide meaningful error messages
- Use custom error classes
- Implement retry logic for transient failures

### Performance
- Use parallel operations where possible
- Implement caching strategically
- Optimize database queries (GSI, pagination)
- Monitor and profile regularly

### Security
- Never log sensitive data
- Validate all inputs
- Use parameterized queries
- Follow least privilege principle

### Documentation
- Keep README files updated
- Document complex logic inline
- Maintain API documentation (OpenAPI)
- Update architecture diagrams
