# AGENTS.md - packages/agent

## Architecture

Layered architecture inspired by [OpenAI's Harness Engineering](https://openai.com/ja-JP/index/harness-engineering/).
Layer dependencies are mechanically enforced via `tests/architecture/layer-dependency.test.ts`.

## Non-obvious Rules

### Provider Layer (libs/)

- `libs/` can be imported from **any** core layer
- `libs/` itself can **only** depend on `types/` (L0) and `config/` (L1)
- Provider modules should not depend on each other circularly
