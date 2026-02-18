# Tool Documentation Auto-Generation

## When to regenerate tool docs

Whenever files in `packages/libs/tool-definitions/src/definitions/` or `packages/lambda-tools/tools/*/tool-schema.json` are created, modified, or deleted, you **MUST** regenerate the tool reference documentation by running:

```bash
npm run -w packages/libs/tool-definitions build && npx ts-node scripts/generate-tool-docs.ts
```

This ensures `docs/tools.md` stays in sync with the actual tool definitions.

## When adding a new built-in tool

After completing the tool implementation:

1. Create the definition file in `packages/libs/tool-definitions/src/definitions/`
2. Add exports to `packages/libs/tool-definitions/src/definitions/index.ts`
3. Implement the handler in `packages/agent/src/tools/`
4. Register in `packages/agent/src/tools/index.ts`
5. **Run the doc generation command above**
6. If the new tool doesn't fit an existing category in `scripts/generate-tool-docs.ts`, add it to the `CATEGORIES` array

## When adding a new Lambda tool

After completing the Lambda tool implementation:

1. Ensure `tool-schema.json` is properly defined
2. **Run the doc generation command above**