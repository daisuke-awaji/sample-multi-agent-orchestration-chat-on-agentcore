# Technology Stack

## Build System

**Monorepo**: npm workspaces with multiple packages
**Node.js**: v22.12.0+ (see `.node-version`)
**Package Manager**: npm (with `npm ci` for clean installs)

## Core Technologies

### Backend (Agent & Backend packages)
- **Runtime**: Node.js with TypeScript (ES2022 target)
- **Framework**: Express.js
- **AI SDK**: Strands Agents SDK (@strands-agents/sdk)
- **AWS SDK**: Bedrock AgentCore, S3, DynamoDB, Secrets Manager, Cognito
- **Auth**: JWT with JWKS verification (jose library)
- **MCP**: Model Context Protocol SDK (@modelcontextprotocol/sdk)
- **Validation**: Zod schemas

### Frontend
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS 3
- **State**: Zustand
- **Routing**: React Router 7
- **i18n**: i18next with react-i18next
- **Markdown**: react-markdown with remark-gfm, rehype-katex
- **Diagrams**: Mermaid

### Infrastructure
- **IaC**: AWS CDK (TypeScript)
- **Deployment**: CloudFormation via CDK

## TypeScript Configuration

- **Strict Mode**: Enabled across all packages
- **Module System**: 
  - Agent: ESM (`"type": "module"`)
  - Backend: ESM (`"type": "module"`)
  - Frontend: ESM (Vite default)
- **Target**: ES2022
- **Module Resolution**: Node

## Code Quality Tools

### Linting & Formatting
- **ESLint**: typescript-eslint with recommended rules
- **Prettier**: Single quotes, 2-space tabs, 100 char line length
- **Pre-commit**: Husky + lint-staged (auto-format on commit)

### Testing
- **Framework**: Jest 30 with ts-jest
- **Coverage**: Configured per package
- **Integration Tests**: Separate `.integration.test.ts` files

## Common Commands

### Development
```bash
npm run dev              # Start all services (frontend, backend, agent)
npm run dev:frontend     # Frontend only (Vite dev server)
npm run dev:backend      # Backend only (tsx watch)
npm run dev:agent        # Agent only (tsx watch)
```

### Building
```bash
npm run build            # Build all packages
npm run build:lambda     # Build Lambda tools
```

### Testing
```bash
npm test                 # Run all tests
npm run test:integration # Integration tests only
npm run test:coverage    # With coverage report
```

### Deployment
```bash
npm run deploy           # Deploy to AWS (default env)
npm run deploy:dev       # Deploy to dev environment
npm run deploy:stg       # Deploy to staging
npm run deploy:prd       # Deploy to production
npm run destroy          # Destroy stack
```

### Code Quality
```bash
npm run lint             # Lint all packages
npm run lint:fix         # Auto-fix linting issues
npm run format           # Format with Prettier
npm run format:check     # Check formatting
```

### Docker (Agent & Backend)
```bash
npm run agent:docker     # Run agent in Docker
npm run backend:docker   # Run backend in Docker
```

## Environment Variables

Each package has `.env.example` files. Copy to `.env` and configure:
- **Agent**: AWS credentials, Bedrock config, MCP settings
- **Backend**: Cognito config, JWKS URI, CORS origins
- **Frontend**: API URLs, Cognito User Pool details
