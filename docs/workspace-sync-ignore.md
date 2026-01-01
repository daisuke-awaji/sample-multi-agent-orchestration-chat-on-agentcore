# Workspace Sync - .syncignore Pattern Matching

## 概要

Workspace Sync 機能は、S3ストレージとローカルワークスペース間でファイルを同期します。`.syncignore` ファイルを使用することで、同期対象から除外するファイルやディレクトリを指定できます。

## デフォルトの除外パターン

以下のファイル/ディレクトリはデフォルトで同期から除外されます：

### バージョン管理
- `.git/`
- `.svn/`
- `.hg/`

### 依存関係
- `node_modules/`
- `bower_components/`
- `vendor/`

### ビルド成果物
- `dist/`
- `build/`
- `out/`
- `target/`
- `.next/`
- `.nuxt/`

### 環境変数と秘密情報
- `.env`
- `.env.*` (例外: `.env.example` は同期される)
- `*.pem`
- `*.key`
- `*.p12`
- `*.pfx`

### ログファイル
- `*.log`
- `logs/`
- `npm-debug.log*`
- `yarn-debug.log*`
- `yarn-error.log*`

### 一時ファイル
- `*.tmp`
- `*.temp`
- `*.swp`
- `*.swo`
- `*~`
- `.DS_Store`
- `Thumbs.db`

### IDE 設定
- `.vscode/`
- `.idea/`
- `*.iml`
- `.project`
- `.classpath`
- `.settings/`

### キャッシュ
- `.cache/`
- `.npm/`
- `.yarn/`
- `.pnp/`

## .syncignore ファイルの作成

### 配置場所

S3バケットのユーザールートディレクトリに `.syncignore` ファイルを配置します：

```
s3://your-bucket/users/{userId}/.syncignore
```

### 書き方

`.gitignore` と同じ形式で記述します：

```gitignore
# コメントは # で始める

# 特定のファイルを除外
*.pdf
*.zip

# ディレクトリを除外
temp/
archives/

# ワイルドカードパターン
**/*.bak
**/__pycache__/

# 否定パターン (除外ルールを上書き)
*.log
!important.log
```

## パターン構文

### 基本パターン

- `filename.ext` - 特定のファイル名にマッチ
- `*.ext` - 特定の拡張子を持つすべてのファイル
- `dirname/` - 特定のディレクトリとその中身すべて

### ワイルドカード

- `*` - 0文字以上の任意の文字列（スラッシュ以外）
- `**` - 0個以上のディレクトリ
- `?` - 任意の1文字

### 例

```gitignore
# すべての.logファイルを除外
*.log

# すべてのテストファイルを除外（どの階層でも）
**/*.test.js
**/*.spec.ts

# buildディレクトリとその中身を除外
build/

# 一時ファイルを除外
temp*
*.tmp
*.temp

# ログを除外するが、important.logは同期する
*.log
!important.log
```

## 使用例

### Python プロジェクト

```gitignore
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
ENV/
.pytest_cache/
.mypy_cache/
*.egg-info/
dist/
```

### Node.js プロジェクト

```gitignore
# Node.js
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.npm/
.yarn/
dist/
build/
.next/
.nuxt/
coverage/
```

### Java プロジェクト

```gitignore
# Java
*.class
*.jar
*.war
target/
build/
.gradle/
.idea/
*.iml
```

## 注意事項

1. **デフォルトパターンは常に適用されます**
   - `.syncignore` ファイルでカスタムパターンを追加できます
   - デフォルトパターンを無効化することはできません

2. **否定パターンの優先度**
   - `!` で始まるパターンは除外ルールを上書きします
   - 例: `*.log` で除外しても `!important.log` で同期対象にできます

3. **パフォーマンスへの影響**
   - 不要なファイルを除外することで、同期時間を短縮できます
   - 特に `node_modules/`、`build/`、`dist/` などの大きなディレクトリはデフォルトで除外されます

4. **パスの形式**
   - Unixスタイルのパス (`/`) を使用します
   - Windowsパス (`\`) も自動的に変換されます

## トラブルシューティング

### パターンが機能しない場合

1. パターンの構文を確認してください
2. ログを確認して、パターンが正しく読み込まれているか確認します
3. `.syncignore` ファイルが正しいS3パスに配置されているか確認します

### ログ確認方法

同期時に以下のログが出力されます：

```
[WORKSPACE_SYNC] Loading .syncignore from S3: users/{userId}/.syncignore
[WORKSPACE_SYNC] Custom .syncignore loaded successfully
[SYNC_IGNORE] Loaded patterns: { ignorePatterns: 45, negatePatterns: 1 }
[WORKSPACE_SYNC] Download complete: 150 files downloaded, 320 files ignored in 2500ms
```

## API

### WorkspaceSync.getIgnorePatterns()

現在適用されているパターンを取得できます（デバッグ用）：

```typescript
const patterns = workspaceSync.getIgnorePatterns();
console.log(patterns.ignore);  // 除外パターンの配列
console.log(patterns.negate);  // 否定パターンの配列
```

## 関連ファイル

- `packages/agent/src/services/sync-ignore-pattern.ts` - パターンマッチングロジック
- `packages/agent/src/services/workspace-sync.ts` - 同期ロジック
- `packages/agent/src/services/__tests__/sync-ignore-pattern.test.ts` - テスト
