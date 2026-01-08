# Fullstack AgentCore

> [🇺🇸 English README is here](./README.md)

Amazon Bedrock AgentCoreを基盤とした本格的なAIエージェントシステムです。生成AIアプリケーションをデプロイするためのプロダクションレディなプラットフォームを提供します。

## 🎯 概要

FullStack AgentCoreは、チームがAIエージェントを作成、カスタマイズし、組織全体で共有できるエンタープライズ対応のマルチエージェントプラットフォームです。Amazon Bedrockをベースに構築されており、ソフトウェア開発、データ分析、コンテンツ作成など、様々な分野に特化した11種類以上のエージェントを提供します。

<div align="center">
  <table>
    <tr>
      <td width="50%">
        <img src="./docs/assets/agentchat.geeawa.net_chat.png" alt="チャットインターフェース" width="100%" style="border: 1px solid #333; border-radius: 4px;">
        <p align="center"><b>直感的なチャットインターフェース</b><br/>シンプルで使いやすいインターフェースで専門的なAIエージェントと対話</p>
      </td>
      <td width="50%">
        <img src="./docs/assets/agentchat.geeawa.net_chat_share_agent.png" alt="エージェント共有" width="100%" style="border: 1px solid #333; border-radius: 4px;">
        <p align="center"><b>組織全体でのエージェント共有</b><br/>チーム内でAIエージェントを発見・共有</p>
      </td>
    </tr>
  </table>
</div>

### ✨ 主な特徴

- **🤖 11種類以上の専門エージェント**: Software Developer、Data Analyst、Physicist、Content Creatorなど
- **🔄 エージェント共有**: カスタムエージェントを作成し、組織全体で共有可能
- **🛠️ 拡張可能なツール**: コマンド実行、Web検索、画像生成、外部サービス連携など
- **💾 ファイルストレージ**: ドキュメントやリソース用の組み込みクラウドストレージ
- **🔐 エンタープライズ対応**: JWT認証、セッション管理、AWS Cognito統合
- **📊 メモリとコンテキスト**: 永続的な会話履歴とコンテキスト認識

## 🏗️ アーキテクチャ

このプロジェクトは、Amazon Bedrockを活用したAIエージェントをデプロイするための完全なスタックを提供します。

<div align="center">
  <img src="./docs/fullstack-agentcore-architecture.drawio.png" alt="アーキテクチャ図" width="80%" style="border: 1px solid #333; border-radius: 4px;">
</div>

| コンポーネント | 技術スタック | ポート | 役割 | AWSサービス |
|-----------|-----------------|------|------|--------------|
| **Frontend** | React + Vite + Tailwind CSS | 5173 | Web UI | CloudFront, S3 |
| **Backend** | Express + JWT + AWS SDK | 3000 | APIサーバー、認証 | Lambda, API Gateway |
| **Agent** | Express + Strands Agents SDK | 8080 | AIエージェントランタイム | AgentCore Runtime, AgentCore Memory, Amazon Bedrock |
| **CLI** | Commander.js | - | コマンドラインインターフェース | Cognito (JWT Auth) |
| **CDK** | AWS CDK + TypeScript | - | Infrastructure as Code | CloudFormation |
| **Lambda Tools** | AWS Lambda + MCP | - | AgentCore Gateway Tools | Lambda, Bedrock Knowledge Base |

## ✨ 主要機能

- **プロダクションレディ**: セキュリティベストプラクティスに基づく堅牢なフルスタック実装
- **Amazon Bedrock統合**: Claudeモデルやその他の基盤モデルとのシームレスな統合
- **メモリとコンテキスト**: AgentCore Memoryによる組み込みセッション管理
- **ファイル操作**: ユーザーファイルとエージェントデータのS3ベースストレージ
- **認証**: CognitoベースのJWT認証システム
- **拡張性**: カスタムツール用のMCP（Model Context Protocol）サポート
- **開発者フレンドリー**: ホットリロード、Dockerサポート、包括的な開発ツール

## 🚀 デプロイ

<details>
<summary><strong>前提条件</strong></summary>

- **Node.js 22.12.0+** （[n](https://github.com/tj/n)によるバージョン管理、`.node-version`参照）
- **AWS CLI** 適切な認証情報で設定済み
- **Amazon Bedrockモデルアクセス**: AWSアカウントで必要なモデルを有効化
  - テキスト生成モデル（例：Claude Sonnet）
  - 画像生成モデル（画像機能を使用する場合）
  - 動画生成モデル（動画機能を使用する場合）
  - モデルIDとリージョンは[`/packages/cdk/cdk.json`](/packages/cdk/cdk.json)を確認

</details>

### AWSへのデプロイ

#### 1. **依存関係のインストール**

```bash
npm ci
```

#### 2. **シークレットの設定（オプション）**

対象環境のAWS Secrets ManagerにAPIキーとトークンを保存します：

**Tavily APIキー**（Web検索ツール用）：

```bash
aws secretsmanager create-secret \
  --name "agentcore/default/tavily-api-key" \
  --secret-string "tvly-your-api-key-here" \
  --region ap-northeast-1
```

> APIキーは[Tavily](https://tavily.com/)から取得してください

**GitHubトークン**（GitHub CLI統合用）：

```bash
aws secretsmanager create-secret \
  --name "agentcore/default/github-token" \
  --secret-string "ghp_your-token-here" \
  --region ap-northeast-1
```

> トークンは[GitHub Settings](https://github.com/settings/tokens)から生成してください。詳細は[GitHub CLI統合ガイド](docs/github-cli-integration.md)を参照。

**注意**: ローカル開発の場合は、`packages/agent/.env`で環境変数として設定することもできます。

#### 3. **CDKのブートストラップ（初回のみ）**
```bash
npx -w packages/cdk cdk bootstrap
```

#### 4. **スタックのデプロイ**

```bash
# デフォルトリージョンにデプロイ（AWS CLI設定に基づく）
npm run deploy

# 特定のリージョンにデプロイ
AWS_REGION=eu-west-1 AWS_DEFAULT_REGION=eu-west-1 CDK_DEFAULT_REGION=eu-west-1 npm run deploy
```

デプロイ後、CloudFormationスタックの出力にフロントエンドURLが含まれます。ブラウザでURLを開いてアプリケーションの使用を開始してください。

## 📖 ドキュメント

### ユーザーガイド
- [📘 User Guide (English)](docs/USER_GUIDE.md) - 機能紹介とエンドユーザー向けガイド（英語版）

### 技術ドキュメント
- [💻 ローカル開発環境のセットアップ](docs/local-development-setup.md) - 環境セットアップの自動化
- [🔐 JWT認証システム](docs/jwt-authentication.md) - 認証の詳細
- [🚀 PR自動デプロイ](docs/pr-auto-deploy-setup.md) - GitHub Actions による PR 環境の自動デプロイ
- [📊 アーキテクチャ図](docs/fullstack-agentcore-architecture.drawio.png)

## 🛠️ 開発

ローカル開発については、[開発ガイド](docs/DEVELOPMENT.md)を参照してください。以下の内容を含みます：
- プロジェクト構造と構成
- ホットリロードでのローカル実行
- Dockerベースの開発
- npmスクリプトリファレンス
- テストとデバッグ

## 📝 ライセンス

このプロジェクトはMITライセンスの下でライセンスされています。詳細はLICENSEファイルを参照してください。

## 🤝 コントリビューション

コントリビューションを歓迎します！プルリクエストをお気軽に送信してください。

## 🔗 関連リソース

- [Amazon Bedrockドキュメント](https://docs.aws.amazon.com/bedrock/)
- [AWS CDKドキュメント](https://docs.aws.amazon.com/cdk/)
- [Strands Agents SDK](https://github.com/awslabs/multi-agent-orchestrator)
- [AgentCore Gateway & M365統合ガイド](https://github.com/akadesilva/agentcore-gateway-demos/blob/main/guides/sharepoint-quickstart.md) - SharePoint/M365との接続セットアップ

---

<p align="center">
  <sub><sup>このリポジトリは個人使用と学習目的の実験的なプロジェクトです。</sup></sub>
</p>
