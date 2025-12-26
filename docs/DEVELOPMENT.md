# Development Guide

Quick reference for developers working on the Fullstack AgentCore project.

## 📁 Project Structure

```
fullstack-agentcore/
├── packages/
│   ├── agent/          # AI Agent Runtime (Express + Strands)
│   ├── backend/        # Backend API (Express + JWT)
│   ├── frontend/       # React Frontend (Vite)
│   ├── client/         # CLI Client
│   ├── cdk/            # AWS Infrastructure (CDK)
│   └── lambda-tools/   # AgentCore Gateway Tools
├── docs/               # Documentation
└── scripts/            # Build and deployment scripts
```

## 🚀 Quick Start

#### 1. **Install dependencies**

```bash
npm ci
```

#### 2. **Set up environment**

```bash
npm run setup-env
```

#### 3. **Start development**

```bash
npm run dev
```

This starts all services:
- Frontend: `localhost:5173`
- Backend: `localhost:3000`
- Agent: `localhost:8080`


## 🔧 Environment Variables

Generated automatically via `npm run setup-env` from CloudFormation outputs.

Manual setup if needed:
```bash
cp packages/frontend/.env.example packages/frontend/.env
cp packages/backend/.env.example packages/backend/.env
cp packages/agent/.env.example packages/agent/.env
```

See [Local Development Setup](./local-development-setup.md) for details.

## 🐛 Troubleshooting

### Port conflicts
```bash
lsof -ti:3000 | xargs kill -9  # Backend
lsof -ti:8080 | xargs kill -9  # Agent
lsof -ti:5173 | xargs kill -9  # Frontend
```

### Module not found
```bash
rm -rf node_modules package-lock.json
npm ci
```

### Environment issues
```bash
npm run setup-env  # Regenerate .env files
```

