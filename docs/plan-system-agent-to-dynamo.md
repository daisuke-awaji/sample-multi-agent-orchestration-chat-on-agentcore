# 実装計画: System Agent を DynamoDB に統一

## 背景

現在、default/system agent は DynamoDB に保存されず、リクエストのたびに `DEFAULT_AGENTS` 配列からインメモリで `BackendAgent` を組み立てている。
`userId: 'system'`, `agentId: 'default-0'` という合成 ID を使うため:

- Branded type の穴（`as UserId` / `as AgentId` キャスト）が残る
- `agents.ts` ルートに system/user 分岐コードが散在
- `system-ids.ts` モジュールが必要になっている
- フロントエンド (`SharedAgentDetailModal.tsx`) にも `userId === 'system'` 分岐がある

## ゴール

**System agent を既存の ID 採番ルール (UUID v7) に統一し、DynamoDB に保存する。**
これにより `system-ids.ts`、全 system/user 分岐コード、フロントの `userId === 'system'` 判定を削除する。

---

## 設計方針

### Well-known System UserId

System agent 用に **固定の UUID v7** を使う:

```
SYSTEM_USER_ID = "00000000-0000-7000-0000-000000000000"
```

- UUID フォーマットなので `isUserId()` / `parseUserId()` を通る
- `00000000-...` は Cognito sub として発行されることがないため衝突しない
- `@moca/core` に定数として定義（既存の `system-ids.ts` を置き換え）

### System AgentId

通常ユーザーの agent と同じく `uuidv7()` で採番。固定 ID は持たない。

### seed メカニズム

現在の `POST /agents/initialize` と同じパターンを利用:
- アプリ起動時（または初回デプロイ時）に system user の agent が 0 件であれば seed
- 既に存在すれば skip（冪等性）

### Shared Agent の表示

System agent は DynamoDB に `isShared: 'true'` で保存されるので、
`listSharedAgents()` の GSI クエリで自動的に列挙される。
ルートハンドラで `DEFAULT_AGENTS` をインメモリ結合する処理は不要になる。

### Clone

System agent も通常の shared agent と同じ UUID 形式なので、
`cloneAgent(userId, agentId)` の 1 パスで処理できる。
フロントの `userId === 'system'` 分岐も不要。

---

## 影響範囲

### 変更するファイル

| ファイル | 変更内容 |
|---------|---------|
| `packages/libs/core/src/system-ids.ts` | well-known UUID 定数に置き換え。`systemAgentId`, `systemScenarioId`, `isSystemAgentId` を削除 |
| `packages/libs/core/src/__tests__/system-ids.test.ts` | テスト更新 |
| `packages/libs/core/src/index.ts` | export 更新（削除分反映） |
| `packages/backend/src/services/agents-service.ts` | `seedSystemAgents()` メソッド追加 |
| `packages/backend/src/routes/agents.ts` | **大幅簡素化**: shared-agents/list の DEFAULT_AGENTS インメモリ結合削除、shared-agents/:userId/:agentId の system 分岐削除、shared-agents/.../clone の system 分岐削除 |
| `packages/backend/src/data/default-agents.ts` | 変更なし（seed データソースとして継続利用） |
| `packages/backend/src/index.ts` (or startup) | 起動時に `seedSystemAgents()` を呼び出す |
| `packages/frontend/src/components/SharedAgentDetailModal.tsx` | `userId === 'system'` 分岐削除。全 agent を `cloneAgent()` パスに統一 |

### 変更しないファイル

- `packages/cdk/` — DynamoDB テーブル定義は変更不要（PK=userId, SK=agentId はどちらも STRING で UUID を受け入れる）
- `packages/frontend/src/utils/agent-translation.ts` — 翻訳キー判定 (`defaultAgents.` prefix) は引き続き有効。DynamoDB に保存されるデータにも翻訳キーが入るので、フロントの翻訳ロジックはそのまま動く

---

## 実装ステップ

### Step 1: `@moca/core` — `system-ids.ts` を well-known UUID に置き換え

**Before:**
```ts
export const SYSTEM_USER_ID = 'system' as UserId;
export function systemAgentId(index: number): AgentId { ... }
export function systemScenarioId(...): string { ... }
export function isSystemUserId(userId: string): boolean { ... }
export function isSystemAgentId(agentId: string): boolean { ... }
```

**After:**
```ts
/**
 * Well-known UUID for the system user that owns default agents.
 * This is a valid UUID v7 with a reserved prefix (00000000-...)
 * that will never collide with Cognito-issued user IDs.
 */
export const SYSTEM_USER_ID = parseUserId('00000000-0000-7000-0000-000000000000');

/** Check if a UserId is the well-known system user */
export function isSystemUser(userId: UserId): boolean {
  return userId === SYSTEM_USER_ID;
}
```

`systemAgentId`, `systemScenarioId`, `isSystemAgentId` は **削除**。

### Step 2: `agents-service.ts` — `seedSystemAgents()` 追加

```ts
/**
 * Seed default agents for the system user.
 * Idempotent: skips if agents already exist.
 */
async seedSystemAgents(defaultAgents: CreateAgentInput[]): Promise<void> {
  const existing = await this.listAgents(SYSTEM_USER_ID);
  if (existing.length > 0) {
    console.log('System agents already seeded, skipping');
    return;
  }

  for (const input of defaultAgents) {
    const agent = await this.createAgent(SYSTEM_USER_ID, input, 'System');
    // Mark as shared
    await this.toggleShare(SYSTEM_USER_ID, agent.agentId);
  }
  console.log(`Seeded ${defaultAgents.length} system agents`);
}
```

### Step 3: Backend 起動時に seed 実行

`packages/backend/src/index.ts` (Express app 起動後) に:

```ts
// Seed system agents on startup (idempotent)
const agentsService = createAgentsService();
agentsService.seedSystemAgents(DEFAULT_AGENTS).catch((err) => {
  console.error('Failed to seed system agents:', err);
});
```

### Step 4: `agents.ts` ルートハンドラ簡素化

#### `GET /shared-agents/list`
- `DEFAULT_AGENTS.map(...)` でインメモリ結合するコード **全削除**
- `listSharedAgents()` の結果をそのまま返す（system agent は DynamoDB の GSI から取得される）

#### `GET /shared-agents/:userId/:agentId`
- `isSystemUserId` / `isSystemAgentId` 分岐 **削除**
- 全パス `getSharedAgent(parseUserId(userId), parseAgentId(agentId))` に統一

#### `POST /shared-agents/:userId/:agentId/clone`
- `isSystemUserId` / `isSystemAgentId` 分岐 **削除**
- 全パス `cloneAgent(...)` に統一

### Step 5: フロントエンド `SharedAgentDetailModal.tsx`

```diff
- if (agent.userId === 'system') {
-   await createAgent({ ... });
- } else {
-   await cloneAgent(agent.userId, agent.agentId);
- }
+ // All agents (including system defaults) use the same clone path
+ await cloneAgent(agent.userId, agent.agentId);
```

### Step 6: `system-ids.ts` テスト更新、不要な export 削除

- `systemAgentId`, `systemScenarioId`, `isSystemAgentId` のテスト削除
- `SYSTEM_USER_ID` の値が UUID 形式であることのテスト追加
- `isSystemUser` のテスト追加

### Step 7: クリーンアップ

- `agents.ts` の import から `systemAgentId`, `systemScenarioId`, `isSystemUserId`, `isSystemAgentId` を削除
- `@moca/core/index.ts` の export を更新

---

## リスク・考慮点

### 既存環境のマイグレーション
- 既存デプロイ環境では system agent が DynamoDB に存在しない
- **起動時の seed で自動解決**（冪等）。デプロイ後に backend が起動すれば seed される
- shared-agents/list で system agent が一時的に 2 重表示される可能性はない（seed 前はインメモリ結合コードが消えているので DynamoDB のみ）

### seed 失敗時
- DynamoDB アクセスエラー等で seed 失敗した場合、shared agents 一覧に system agent が表示されない
- 次回起動時にリトライされる（冪等）
- 致命的ではない（ユーザー自身の agent は影響なし）

### Default agent の更新
- 現行: `DEFAULT_AGENTS` を変更 → 即時反映（毎回インメモリ構築のため）
- 変更後: `DEFAULT_AGENTS` を変更 → **seed 済みなので DynamoDB のデータは更新されない**
- 対策: seed ロジックに version チェック（またはハッシュ比較）を入れ、変更検知時に再 seed する。ただし **この PR のスコープでは入れない**。将来の運用課題として Issue 化する

### フロントエンドの翻訳
- `DEFAULT_AGENTS` の `name`, `description`, `scenarios.title/prompt` は翻訳キー（例: `defaultAgents.generalAssistant.name`）
- DynamoDB にそのまま保存される → フロントの `translateIfKey()` が引き続き翻訳する → **問題なし**

---

## テスト計画

| テスト | 内容 |
|--------|------|
| `@moca/core` unit | `SYSTEM_USER_ID` が UUID 形式 / `isUserId()` を通る / `isSystemUser()` が正しく判定 |
| `agents-service` unit | `seedSystemAgents` の冪等性テスト（2 回呼んで 2 重作成されないこと） |
| `agents.ts` route | shared-agents エンドポイントで system 分岐コードが消えていること（コードレビュー） |
| frontend | `SharedAgentDetailModal` で `userId === 'system'` 分岐が消え、全 agent が `cloneAgent` パスを通ること |
| E2E (手動) | デプロイ後 shared agent 一覧に default agent が表示される / clone できる |

---

## 作業見積もり

| Step | 作業内容 | 見積 |
|------|---------|------|
| 1 | `system-ids.ts` 置き換え | 小 |
| 2 | `seedSystemAgents()` 追加 | 小 |
| 3 | 起動時 seed 呼び出し | 小 |
| 4 | `agents.ts` ルート簡素化 | 中（分岐削除 + テスト確認） |
| 5 | フロント修正 | 小 |
| 6-7 | テスト更新 + クリーンアップ | 小 |
| **合計** | | **中規模** |
