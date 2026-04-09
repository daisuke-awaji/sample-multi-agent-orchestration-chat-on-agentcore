# AGENTS.md - packages/backend

## Architecture

Layered architecture inspired by [OpenAI's Harness Engineering](https://openai.com/ja-JP/index/harness-engineering/).
Layer dependencies are mechanically enforced via `tests/architecture/layer-dependency.test.ts`.

## Layer Structure

```
   routes (L4)     ── HTTP Entry Point (Express routers)
       ↓
   services (L3)   ── Business Logic & Data Access (DynamoDB, S3, SSM)
       ↓
   middleware (L2) ── HTTP Middleware (Auth, CORS)
       ↓
   config (L1)     ── Configuration & Static Data
       ↓
   types (L0)      ── Type Definitions

   [libs (-1) - Provider Layer: Cross-cutting concerns]
```

## Non-obvious Rules

### Provider Layer (libs/)

- `libs/` can be imported from **any** core layer
- `libs/` itself can **only** depend on `types/` (L0) and `config/` (L1)
- Provider modules should not depend on each other circularly

### Type Exports

- Domain types (Agent, MCPConfig, etc.) are defined in `types/`
- Services re-export types for backward compatibility with existing consumers
