# Code Complexity Reduction Plan

## Current State (Baseline)

- **Total warnings**: 121 (across 57 files)
- **Cyclomatic Complexity**: 72 warnings
  - Critical (≥25): 10 functions
  - High (15–24): 27 functions
  - Medium (11–14): 35 functions
- **max-depth (>4)**: 23 warnings
- **max-lines-per-function (>100)**: 21 warnings
- **max-params (>4)**: 5 warnings

---

## Phase 1: Critical Complexity (≥25) — 10 functions

**Goal**: Reduce the most dangerous functions first. These are the hardest to test and most likely to contain bugs.

| # | File | Function | Complexity | Refactoring Strategy |
|---|------|----------|-----------|---------------------|
| 1 | `agent/src/tools/s3-list-files.ts` | `callback` | 41 | Extract filter/sort/format into helper functions |
| 2 | `backend/src/routes/triggers.ts` | (arrow fn) | 38 | Extract validation, scheduling, and persistence into separate functions |
| 3 | `agent/src/tools/code-interpreter/client.ts` | `downloadFiles` | 34 | Split into download/convert/save phases |
| 4 | `agent/src/handlers/invocations.ts` | `handleInvocation` | 32 | Extract auth, session setup, streaming into sub-handlers |
| 5 | `agent/src/utils/stream-serializer.ts` | `serializeStreamEvent` | 29 | Use a mapping object or strategy pattern for event types |
| 6 | `cdk/lib/agentcore-stack.ts` | (construct body) | 27 | Extract sub-constructs for each resource group |
| 7 | `client/src/commands/invoke.ts` | `invokeCommand` | 27 | Extract argument parsing, invocation, and output formatting |
| 8 | `backend/src/services/agentcore-memory.ts` | `convertToMessageContents` | 26 | Use a type-to-converter map |
| 9 | `agent/src/tools/execute-command.ts` | `callback` | 25 | Extract option parsing, execution, and output handling |
| 10 | `trigger/src/services/agent-invoker.ts` | `invoke` | 25 | Split into prepare/invoke/process-response |

### Suggested PR Breakdown (Phase 1)

- **PR 1-A**: `s3-list-files.ts` + `stream-serializer.ts` (agent utils — related patterns)
- **PR 1-B**: `invocations.ts` handler refactoring (single large file, needs careful testing)
- **PR 1-C**: `code-interpreter/client.ts` downloadFiles (isolated module)
- **PR 1-D**: `triggers.ts` route refactoring (backend)
- **PR 1-E**: `execute-command.ts` + `agentcore-memory.ts` + `invoke.ts` (smaller functions)
- **PR 1-F**: `agentcore-stack.ts` + `agentcore-runtime.ts` CDK refactoring
- **PR 1-G**: `agent-invoker.ts` trigger refactoring

---

## Phase 2: High Complexity (15–24) — 27 functions

**Goal**: Bring all functions below complexity 15. Apply extract-method and early-return patterns.

### Key Targets

| File | Function | Complexity | Strategy |
|------|----------|-----------|----------|
| `agent/src/handlers/auth-resolver.ts` | `resolveEffectiveUserId` | 21 | Extract claim checks into guard functions |
| `agent/src/tools/browser/tool.ts` | `callback` | 20 | Extract page navigation, action execution |
| `agent/src/session/converters.ts` | `agentCorePayloadToMessage` | 20 | Use type-discriminated converter map |
| `agent/src/tools/call-agent.ts` | `handleStartTask` | 19 | Extract validation + invocation |
| `agent/src/tools/browser/client.ts` | `startSession` | 19 | Extract retry, connection, and setup |
| `agent/src/tools/code-interpreter/tool.ts` | `callback` | 19 | Extract setup and result processing |
| `agent/src/prompts/system-prompt.ts` | `buildSystemPrompt` | 18 | Extract section builders (tools, memory, persona) |
| `agent/src/agent.ts` | `createAgent` | 18 | Extract tool setup and model config |
| `agent/src/services/sub-agent-task-manager.ts` | `executeTask` | 18 | Extract polling and result handling |
| `backend/src/services/triggers-dynamodb.ts` | `updateTrigger` | 23 | Extract field update builders |
| `backend/src/services/agentcore-gateway.ts` | `searchTools` | 21 | Extract pagination and transformation |
| `backend/src/routes/agents.ts` | (arrow fn) | 17 | Extract validation and response building |
| `cdk/lib/constructs/agentcore/agentcore-runtime.ts` | (construct body) | 24 | Extract Lambda/IAM/API setup |

### Suggested PR Breakdown (Phase 2)

- **PR 2-A**: Agent auth + middleware (`auth-resolver.ts`, `request-context.ts`)
- **PR 2-B**: Agent tools batch 1 (`browser/`, `call-agent.ts`, `code-interpreter/tool.ts`)
- **PR 2-C**: Agent tools batch 2 (`nova-canvas/`, `nova-reel/`, `manage-agent.ts`)
- **PR 2-D**: Agent core (`agent.ts`, `system-prompt.ts`, `converters.ts`, `sub-agent-task-manager.ts`)
- **PR 2-E**: Backend services (`triggers-dynamodb.ts`, `agentcore-gateway.ts`, `agents-service.ts`)
- **PR 2-F**: Backend routes (`triggers.ts` remaining, `agents.ts`, `sessions.ts`)
- **PR 2-G**: CDK constructs (`agentcore-runtime.ts`)

---

## Phase 3: Medium Complexity (11–14) + Other Rules — 84 warnings

**Goal**: Clean up remaining warnings. Lower-risk, can be done opportunistically.

### Categories

- **complexity 11–14**: 35 functions — Apply early returns, extract conditionals
- **max-depth >4**: 23 warnings — Flatten with early returns, extract inner blocks
- **max-lines-per-function >100**: 21 warnings — Extract helper functions, split long handlers
- **max-params >4**: 5 warnings — Introduce options objects / config patterns

### Strategy

These can be addressed:
1. As part of feature work touching these files (boy scout rule)
2. In dedicated small PRs grouped by package
3. By gradually tightening thresholds once Phase 1–2 are complete

---

## Graduation Plan: warn → error

| Milestone | Action | Target |
|-----------|--------|--------|
| Phase 1 complete | Set `complexity` threshold to `error` at 25 | Prevent critical regressions |
| Phase 2 complete | Tighten `complexity` to `error` at 15 | Block high complexity |
| Phase 3 complete | Set all rules to `error` at current thresholds | Full enforcement |

---

## Timeline Estimate

| Phase | Scope | Estimated PRs | Effort |
|-------|-------|---------------|--------|
| Phase 1 | Critical (≥25) | 7 PRs | 1–2 weeks |
| Phase 2 | High (15–24) | 7 PRs | 2–3 weeks |
| Phase 3 | Medium + other rules | Ongoing | Continuous |

---

## Principles

1. **Each PR should be small and focused** — one module or closely related files
2. **Tests must pass** — no behavior changes unless bugs are found
3. **Refactoring only** — no feature changes mixed with complexity reduction
4. **Prefer extract-method** — the simplest and safest refactoring pattern
5. **Use early returns** to reduce nesting depth
6. **Replace switch/if chains** with lookup maps where appropriate
