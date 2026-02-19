Language: [English](./README.md) / [Japanese](./README-ja.md)

# ☕ Moca — Multi-agent Orchestration Chat on AgentCore

Amazon Bedrock AgentCore を活用したマルチエージェント協調チャットプラットフォームです。

## 概要

Mocaは、チームが AI エージェントを**自由に作成・カスタマイズ**し、組織全体で共有できるマルチエージェントプラットフォームです。Amazon Bedrock AgentCore をベースに構築されており、用途に応じたエージェントを簡単に構築できます。

すぐに使い始められるプリセットエージェントも用意されており、ソフトウェア開発、データ分析、コンテンツ作成など、様々な分野に対応しています。

<div align="center">
  <table>
    <tr>
      <td width="50%">
        <img src="./docs/assets/agentchat.geeawa.net_chat.png" alt="チャットインターフェース" width="100%">
        <p align="center"><b>チャット</b><br/>専門的な AI エージェントとシンプルな UI で対話できます</p>
      </td>
      <td width="50%">
        <img src="./docs/assets/agentchat.geeawa.net_chat_share_agent.png" alt="エージェント共有" width="100%">
        <p align="center"><b>エージェントの共有</b><br/>カスタムエージェントをチーム内で発見・共有できます</p>
      </td>
    </tr>
    <tr>
      <td width="50%">
        <img src="./docs/assets/agentchat.geeawa.net_event_integration.png" alt="イベント連携" width="100%">
        <p align="center"><b>イベント駆動</b><br/>スケジュールや外部イベントでエージェントを自動実行できます</p>
      </td>
      <td width="50%">
        <img src="./docs/assets/agentchat.geeawa.net_tools.png" alt="ツール" width="100%">
        <p align="center"><b>拡張可能なツール</b><br/>ツールを追加・設定してエージェントの機能を拡張できます</p>
      </td>
    </tr>
  </table>
</div>

### 主な特徴

- **カスタムエージェント作成** - 目的に応じたエージェントを自由に設計・構築できます
- **組織内での共有** - 作成したエージェントをチーム全体で発見・共有できます
- **プリセットエージェント** - Software Developer、Data Analyst、Physicist等、すぐに使えるエージェントを用意しています
- **拡張可能なツール** - コマンド実行、Web検索、画像生成、外部サービス連携などに対応しています
- **ファイルストレージ** - ドキュメントやリソース用のクラウドストレージを組み込んでいます
- **エンタープライズ対応** - JWT認証、セッション管理、AWS Cognito統合をサポートしています
- **メモリとコンテキスト** - 永続的な会話履歴とコンテキストを認識します

## アーキテクチャ

本アプリケーションは Amazon Bedrock AgentCore を基盤としたフルサーバーレスアーキテクチャを採用しています。ユーザーリクエストは React フロントエンドから Cognito 認証を経て AgentCore Runtime に到達し、AgentCore Gateway 経由のツール統合とともに AI エージェントが稼働します。

<br>

<div align="center">
  <img src="./docs/moca-architecture.drawio.png" alt="アーキテクチャ図" width="100%">
</div>

<br>

### Tech Stack


| レイヤー | サービス |
|---------|---------|
| フロントエンド | CloudFront + S3 (React SPA) |
| 認証 | Amazon Cognito (JWT) |
| API | Lambda + API Gateway (Express.js) |
| エージェント | AgentCore Runtime + Gateway + Memory + CodeInterpreter|
| ストレージ | DynamoDB + S3 |
| リアルタイム | AppSync Events (WebSocket) |
| イベント | EventBridge Scheduler |

バックエンド API はエージェント管理、セッション永続化、ファイル操作などを担当します。AgentCore Runtime は Strands Agents SDK (TypeScript) を使用してエージェントを実行し、会話コンテキストのための短期記憶（セッション履歴）および長期記憶（永続メモリ）が有効化されています。リアルタイムストリーミングは AppSync Events によって実現され、スケジュールトリガーによって自動的にエージェントを実行することが可能です。

## デプロイ

<details>
<summary><strong>前提条件</strong></summary>

デプロイには以下の環境が必要です。

- **Node.js 22.12.0+** - [n](https://github.com/tj/n)によるバージョン管理を推奨します。`.node-version`を参照してください。
- **AWS CLI** - 適切な認証情報で設定しておく必要があります。

</details>

### AWSへのデプロイ

#### 1. 依存関係のインストール

まず、依存関係をインストールします。

```bash
npm ci
```

#### 2. シークレットの設定（オプション）

必要に応じて、対象環境のAWS Secrets ManagerにAPIキーとトークンを保存します。

**Tavily APIキー**（Web検索ツール用）

```bash
aws secretsmanager create-secret \
  --name "agentcore/default/tavily-api-key" \
  --secret-string "tvly-your-api-key-here" \
  --region ap-northeast-1
```

APIキーは[Tavily](https://tavily.com/)から取得できます。

**GitHubトークン**（GitHub CLI統合用）

```bash
aws secretsmanager create-secret \
  --name "agentcore/default/github-token" \
  --secret-string "ghp_your-token-here" \
  --region ap-northeast-1
```

トークンは[GitHub Settings](https://github.com/settings/tokens)から生成できます。

ローカル開発の場合は、`packages/agent/.env`で環境変数として設定することもできます。

#### 3. CDKのブートストラップ（初回のみ）

初回デプロイ時のみ、CDKのブートストラップを実行します。

```bash
npx -w packages/cdk cdk bootstrap
```

#### 4. スタックのデプロイ

以下のコマンドでスタックをデプロイします。

```bash
npm run deploy
```

デプロイが完了すると、CloudFormationスタックの出力からフロントエンドURLを確認できます。

カスタムドメイン、環境別設定、イベントルールなどの詳細な設定オプションについては、[Deployment Options](docs/deployment-options.md) を参照してください。


## ドキュメント

### ユーザーガイド
- [ユーザーガイド（日本語）](docs/USER_GUIDE-ja.md) - 機能紹介とエンドユーザー向けガイド
- [User Guide (English)](docs/USER_GUIDE.md) - Feature introduction and end-user guide

### 技術ドキュメント
- [Deployment Options](docs/deployment-options.md) - 環境設定とカスタマイズオプション
- [ローカル開発環境のセットアップ](docs/local-development-setup.md) - 環境セットアップの自動化について説明しています
- [JWT認証システム](docs/jwt-authentication.md) - 認証の仕組みについて説明しています
- [アーキテクチャ図](docs/moca-architecture.drawio.png)

## ライセンス

このプロジェクトはMITライセンスの下でライセンスされています。詳細はLICENSEファイルを参照してください。

## コントリビューション

コントリビューションを歓迎します。プルリクエストをお気軽に送信してください。

## 関連リソース

- [Amazon Bedrockドキュメント](https://docs.aws.amazon.com/bedrock/)
- [AWS CDKドキュメント](https://docs.aws.amazon.com/cdk/)
- [Strands Agents SDK](https://strandsagents.com/)
- [AgentCore Gateway & M365統合ガイド](https://github.com/akadesilva/agentcore-gateway-demos/blob/main/guides/sharepoint-quickstart.md)

---

このリポジトリは実験的なサンプルアプリケーションであり、後方互換性を考慮せず更新される可能性があります。AWS が公式で公開している AgentCore のサンプルコードは [fullstack-solution-template-for-agentcore](https://github.com/awslabs/fullstack-solution-template-for-agentcore) や [sample-amazon-bedrock-agentcore-fullstack-webapp](https://github.com/aws-samples/sample-amazon-bedrock-agentcore-fullstack-webapp) をご覧ください。