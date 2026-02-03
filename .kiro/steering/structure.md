# Project Structure

## Monorepo Layout

```
fullstack-agentcore/
├── packages/              # All application packages
│   ├── agent/            # AI Agent Runtime (Express + Strands SDK)
│   ├── backend/          # Backend API (Express + JWT auth)
│   ├── frontend/         # React SPA (Vite + React 19)
│   ├── client/           # CLI client
│   ├── cdk/              # AWS CDK infrastructure
│   ├── lambda-tools/     # Lambda functions for AgentCore Gateway
│   ├── session-stream-handler/  # DynamoDB stream handler
│   ├── trigger/          # Event-driven agent triggers
│   └── shared/           # Shared code (tool-definitions)
├── docs/                 # Documentation
├── scripts/              # Build and utility scripts
├── .clinerules/          # AI assistant development rules
└── .kiro/                # Kiro AI steering rules
```

## Package Details

### packages/agent
AI Agent Runtime that implements AgentCore Runtime API (`/ping`, `/invocations`).

**Key directories**:
- `src/agent.ts` - Main agent implementation with Strands SDK
- `src/tools/` - Agent tools (weather, file operations, etc.)
- `src/mcp/` - MCP client integration (stdio, HTTP, SSE)
- `src/session/` - Session management and persistence
- `src/models/` - Bedrock model integration
- `src/prompts/` - System prompts and context

### packages/backend
Backend API server with JWT authentication and agent management.

**Key directories**:
- `src/routes/` - API route handlers
- `src/services/` - Business logic (agents, sessions, S3, DynamoDB)
- `src/middleware/` - Express middleware (auth, CORS)
- `src/mcp/` - MCP tool fetching and configuration

### packages/frontend
React SPA with Vite, Tailwind CSS, and Zustand state management.

**Key directories**:
- `src/pages/` - Page components (ChatPage, AgentsPage, etc.)
- `src/components/` - Reusable UI components
- `src/api/` - API client functions
- `src/stores/` - Zustand stores (chatStore, agentStore, etc.)
- `src/hooks/` - Custom React hooks
- `src/features/` - Feature-specific modules (auth)
- `src/locales/` - i18n translations (en.yaml, ja.yaml)

### packages/cdk
AWS CDK infrastructure definitions.

**Key directories**:
- `bin/app.ts` - CDK app entry point
- `lib/agentcore-stack.ts` - Main CloudFormation stack
- `lib/constructs/` - Reusable CDK constructs (API, auth, storage, etc.)
- `config/` - Environment-specific configurations

### packages/shared/tool-definitions
Shared tool definitions and schemas used across packages.

## File Naming Conventions

- **Components**: `PascalCase.tsx` (e.g., `UserProfile.tsx`)
- **Utilities/Services**: `kebab-case.ts` (e.g., `user-service.ts`)
- **Types**: `types.ts` or `interfaces.ts`
- **Tests**: `*.test.ts`, `*.spec.ts`, or `*.integration.test.ts`
- **Config**: `.env`, `tsconfig.json`, `package.json`

## Import Organization

1. Node.js built-in modules
2. External packages
3. Internal packages (workspace dependencies)
4. Relative imports

## Adding New Code

### New Agent Tool
1. Create in `packages/agent/src/tools/`
2. Export from `packages/agent/src/tools/index.ts`
3. Auto-registered by agent

### New API Endpoint
1. Create route in `packages/backend/src/routes/`
2. Add service logic in `packages/backend/src/services/`
3. Register in `packages/backend/src/index.ts`

### New Frontend Component
- Reusable: `packages/frontend/src/components/`
- Feature-specific: `packages/frontend/src/features/{feature}/`
- Page: `packages/frontend/src/pages/`

### New CDK Construct
1. Create in `packages/cdk/lib/constructs/`
2. Use in `packages/cdk/lib/agentcore-stack.ts`

## Key Configuration Files

### Root Level
- `package.json` - Workspace configuration and scripts
- `tsconfig.base.json` - Base TypeScript config (strict mode, ES2022)
- `eslint.config.mjs` - ESLint configuration with package-specific rules
- `.prettierrc` - Code formatting rules

### Package Level
Each package has:
- `package.json` - Package dependencies and scripts
- `tsconfig.json` - TypeScript configuration (extends base)
- `.env.example` - Environment variable template

## Special Files

### MCP Configuration
- `packages/agent/mcp.json` - MCP server configuration (stdio, HTTP, SSE)
- `packages/backend/mcp.json` - Backend MCP tool configuration

### Workspace Sync
- `.syncignore` - Files to exclude from S3 workspace sync (gitignore-style)

### Documentation
- `README.md` - Project overview and quick start
- `docs/USER_GUIDE.md` - End-user documentation
- `docs/deployment-options.md` - Deployment configuration guide
- `docs/local-development-setup.md` - Development environment setup

## Best Practices

- Keep directory depth manageable (< 5 levels)
- Group related files together
- Use `index.ts` for clean exports
- One component per file (except small utilities)
- Place tests near source code or in `__tests__/` directory
