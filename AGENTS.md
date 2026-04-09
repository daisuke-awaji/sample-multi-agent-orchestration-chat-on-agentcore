# AGENTS.md

## Documentation Policy

Do not document what can be derived from code. An agent can read the codebase.
Enforce verifiable constraints with tests and linters, not prose.
Code comments explain "why not" only — the non-obvious reason something was done a certain way.
Before adding a line to this file, ask: "If I remove this line, will an agent make a mistake?" If no, don't add it. If a root cause is fixed, remove the corresponding line.

## Project Overview

Moca — Multi-agent Orchestration Chat on AgentCore. A multi-agent platform built on Amazon Bedrock AgentCore.

## Architecture

Monorepo using npm workspaces. 9 packages.

| Package | Responsibility | Runtime | Entry Point |
|---|---|---|---|
| packages/agent | AgentCore Runtime agent. Built with Strands Agents SDK (TypeScript). Runs as a Docker container on AgentCore Runtime | Express (8080) | src/index.ts |
| packages/backend | REST API. Agent management, session persistence, file operations | Express + Lambda Web Adapter (8080) | src/index.ts |
| packages/frontend | React SPA | Vite + Tailwind | index.html |
| packages/cdk | CDK infrastructure. Manages all AWS resources. Environment config in `config/environments.ts` | CDK | lib/agentcore-stack.ts |
| packages/client | API client SDK | — | src/ |
| packages/session-stream-handler | DynamoDB Streams → AppSync Events relay | Lambda | src/ |
| packages/trigger | EventBridge → automatic agent execution | Lambda | src/ |
| packages/lambda-tools | Tool functions deployed as individual Lambdas | Lambda | tools/ |

### Shared Libraries (packages/libs/)

| Library | Responsibility |
|---|---|
| libs/tool-definitions | Tool definition types (Zod + JSON Schema). The **interface layer** referenced by both agent and backend |
| libs/generative-ui-catalog | Generative UI component catalog. Referenced by both agent and frontend |
| libs/s3-workspace-sync | S3 workspace synchronization. Referenced by agent |

## Conventions

- Node.js 22, TypeScript ~5.2
- Package manager: npm workspaces (NOT pnpm)
- Test: jest (agent, backend, libs), vitest (frontend, s3-workspace-sync)
- Linter: eslint + prettier
- Build: `tsc --build tsconfig.build.json` resolves types across the monorepo before building each package

## Deployment

- `npm run deploy` → builds lambda-tools → CDK deploy
- Environments: default / dev / stg / prd (defined in `packages/cdk/config/environments.ts`)
- backend and agent are Docker images (multi-stage build). Dockerfiles live in `docker/`

## Important Rules

- **Changes to libs/ have wide impact**: Changing tool-definitions affects both agent and backend. Changing generative-ui-catalog affects both agent and frontend. Run tests for all dependent packages before merging.
- **Do NOT write Lambda-specific code in backend**: Lambda Web Adapter handles HTTP translation. Implement as a standard Express server with `app.listen(8080)`.
- **agent runs on AgentCore Runtime, NOT Lambda**: It is a Docker container, not a Lambda function. However, it is implemented as an Express server and runs locally with `npm run dev` as-is.
- **Environment config changes**: Edit `packages/cdk/config/environments.ts`. Types are in `environment-types.ts`, utilities in `environment-utils.ts`.
- **Secrets**: Stored in Secrets Manager. Naming convention: `agentcore/{env}/{secret-name}`.
- **Real-time communication**: AppSync Events (WebSocket). session-stream-handler relays from DynamoDB Streams to AppSync.
- **Event-driven automation**: EventBridge Scheduler + Rules → trigger package.