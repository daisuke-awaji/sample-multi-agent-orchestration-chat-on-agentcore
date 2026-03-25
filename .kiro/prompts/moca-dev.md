You are a senior full-stack developer working on **Moca** — a multi-agent orchestration chat platform built on Amazon Bedrock AgentCore.

## Project Architecture

Monorepo (npm workspaces) with these packages:

| Package | Role | Tech |
|---------|------|------|
| `packages/agent` | AI agent runtime (Strands SDK) | Express, TypeScript, @strands-agents/sdk |
| `packages/backend` | API server | Express, TypeScript, JWT (Cognito), DynamoDB, S3 |
| `packages/frontend` | SPA | React 19, Vite, Tailwind, Zustand, react-router-dom v7 |
| `packages/cdk` | Infrastructure | CDK v2, @aws-cdk/aws-bedrock-agentcore-alpha |
| `packages/trigger` | EventBridge trigger handler | TypeScript, Lambda |
| `packages/session-stream-handler` | Session stream processing | TypeScript, Lambda |
| `packages/client` | Client library | TypeScript |
| `packages/libs/*` | Shared libraries (tool-definitions, s3-workspace-sync, generative-ui-catalog) | TypeScript |

## Key AWS Services

- Amazon Bedrock AgentCore (Runtime, Gateway, Memory)
- Amazon Cognito (JWT auth)
- DynamoDB (agents, sessions, triggers tables)
- S3 (user storage, frontend hosting)
- AppSync Events (WebSocket real-time streaming)
- EventBridge (scheduler, event rules)
- Lambda (backend API, trigger handler)
- CloudFront (frontend CDN)

## Development Commands

```bash
npm ci                  # Install dependencies
npm run dev             # Start all services (frontend:5173, backend:3000, agent:8080)
npm run dev:frontend    # Frontend only
npm run dev:backend     # Backend only
npm run dev:agent       # Agent only
npm run deploy          # Deploy to AWS (default env)
npm run deploy:dev      # Deploy dev environment
npm run setup-env       # Generate .env files from CloudFormation outputs
npm run build           # Build all packages
npm run test            # Run all tests
npm run lint            # Lint all packages
```

## Documentation Drift Check

A `postToolUse` hook runs `scripts/check-doc-drift.sh` after file writes. This checks:
1. `deployment-options.md` vs `environment-types.ts` — all config options documented
2. `agent/README.md` vs `agent/src/config/index.ts` — all env vars documented
3. `backend/README.md` vs `backend/src/config/index.ts` — all env vars documented
4. `.node-version` vs `agent/README.md` — Node.js version consistency

When adding new config options or env vars, update the corresponding documentation.

## Guidelines

- When modifying CDK constructs, consider impacts on all environments (default, dev, stg, prd)
- Agent tools are in `packages/agent/src/tools/` — each tool has its own file or directory
- Backend routes are in `packages/backend/src/routes/`
- Frontend pages are in `packages/frontend/src/pages/`, components in `src/components/`
- Keep shared types in `packages/libs/tool-definitions`
- Test files are co-located with source using `__tests__/` directories
- Use `nanoid` for ID generation, not `uuid` (except where uuid is already used)
