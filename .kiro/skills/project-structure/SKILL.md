---
name: project-structure
description: Project structure and organization guidelines for Moca
---

# Project Structure Guide

This document defines the structure and organization of the Moca monorepo.

## Monorepo Architecture

The project uses npm workspaces for managing multiple packages:

```
/
├── packages/           # All application packages
├── docs/              # Project documentation
├── scripts/           # Build and utility scripts
├── .clinerules/       # Cline AI development rules
└── package.json       # Workspace configuration
```

## Package Organization

### packages/agent
AI Agent Runtime built with Express and Strands Agents SDK.

```
packages/agent/
├── src/
│   ├── agent.ts           # Main agent implementation
│   ├── index.ts           # Entry point
│   ├── config/            # Configuration
│   ├── models/            # Bedrock model integration
│   ├── prompts/           # System prompts
│   ├── session/           # Session management
│   ├── tools/             # Agent tools
│   └── mcp/               # MCP client integration
├── scripts/               # Development scripts
├── sessions/              # Local session storage
└── Dockerfile             # Container image
```

### packages/backend
Backend API server with Express and JWT authentication.

```
packages/backend/
├── src/
│   ├── index.ts           # Entry point
│   ├── config/            # Configuration
│   ├── middleware/        # Express middleware
│   ├── routes/            # API routes
│   ├── services/          # Business logic
│   └── mcp/               # MCP integration
└── Dockerfile             # Container image
```

### packages/frontend
React frontend application with Vite.

```
packages/frontend/
├── src/
│   ├── main.tsx           # Entry point
│   ├── App.tsx            # Root component
│   ├── api/               # API client
│   ├── components/        # Reusable components
│   ├── features/          # Feature modules
│   ├── hooks/             # Custom hooks
│   ├── pages/             # Page components
│   ├── stores/            # State management
│   └── utils/             # Utility functions
└── public/                # Static assets
```

### packages/client
CLI client for interacting with the agent.

```
packages/client/
├── src/
│   ├── index.ts           # Entry point
│   ├── api/               # API client
│   ├── auth/              # Authentication
│   ├── commands/          # CLI commands
│   └── config/            # Configuration
```

### packages/cdk
AWS infrastructure as code using CDK.

```
packages/cdk/
├── bin/
│   └── app.ts             # CDK app entry point
├── lib/
│   ├── agentcore-stack.ts # Main stack
│   └── constructs/        # CDK constructs
└── mcp-api/               # MCP Lambda handlers
```

### packages/lambda-tools
Lambda functions for AgentCore Gateway.

```
packages/lambda-tools/
└── tools/
    └── utility-tools/     # Tool implementations
```

## File Naming Conventions

### TypeScript Files
- Components: `PascalCase.tsx` (e.g., `UserProfile.tsx`)
- Utilities: `kebab-case.ts` (e.g., `user-service.ts`)
- Types: `types.ts` or `interfaces.ts`
- Constants: `constants.ts` or `config.ts`

### Test Files
- Unit tests: `*.test.ts` or `*.spec.ts`
- Integration tests: `*.integration.test.ts`
- Place tests in `__tests__/` or `tests/` directory

### Configuration Files
- Environment: `.env`, `.env.example`
- TypeScript: `tsconfig.json`
- Build: `package.json`, `vite.config.ts`

## Adding New Files

### New API Endpoint (Backend)
1. Create route handler in `packages/backend/src/routes/`
2. Add service logic in `packages/backend/src/services/`
3. Register route in `packages/backend/src/index.ts`

### New Agent Tool
1. Create tool in `packages/agent/src/tools/`
2. Export from `packages/agent/src/tools/index.ts`
3. Tool will be auto-registered by agent

### New Frontend Component
1. Create component in appropriate directory:
   - Reusable: `packages/frontend/src/components/`
   - Feature-specific: `packages/frontend/src/features/{feature}/`
   - Page: `packages/frontend/src/pages/`
2. Export from `index.ts` if needed

### New CDK Construct
1. Create construct in `packages/cdk/lib/constructs/`
2. Use in `packages/cdk/lib/agentcore-stack.ts`

## Directory Guidelines

### /src Directory
- Main source code
- Organized by feature or layer (routes, services, etc.)
- Keep flat when possible, nest when grouping is beneficial

### /tests Directory
- Integration tests that require setup
- Test utilities and fixtures
- Separate from unit tests in `__tests__/`

### /docs Directory
- Project documentation
- Keep README.md in root for quick reference
- Detailed guides in `/docs`

### /scripts Directory
- Build scripts
- Deployment utilities
- Development helpers

## Shared Code

### Type Definitions
- Define types close to where they're used
- Share types via explicit exports
- Consider creating `@types/` directory for complex shared types

### Configuration
- Use `config/index.ts` pattern in each package
- Load environment variables at config level
- Export typed configuration objects

## Best Practices

1. **Single Responsibility**: Each file should have one clear purpose
2. **Consistent Structure**: Follow the same pattern across packages
3. **Clear Naming**: File names should indicate content/purpose
4. **Avoid Deep Nesting**: Keep directory depth manageable (< 5 levels)
5. **Group Related Files**: Keep related files close together
6. **Export Pattern**: Use index.ts for clean imports
7. **Documentation**: README.md in complex directories

## Package Dependencies

### Internal Dependencies
Use workspace protocol for internal packages:
```json
{
  "dependencies": {
    "@moca/agent": "workspace:*"
  }
}
```

### External Dependencies
- Core dependencies in `dependencies`
- Build tools in `devDependencies`
- Keep versions aligned across packages when possible
