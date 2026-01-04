# Fullstack AgentCore

A full-stack AI agent system built with Amazon Bedrock AgentCore, providing a production-ready platform for deploying generative AI applications.

<div align="center">
  <img src="./docs/fullstack-agentcore-architecture.drawio.png" alt="Architecture Diagram" width="80%">
</div>

## 🏗️ Architecture

This project provides a complete stack for deploying AI agents powered by Amazon Bedrock:

| Component | Technology Stack | Port | Role | AWS Services |
|-----------|-----------------|------|------|--------------|
| **Frontend** | React + Vite + Tailwind CSS | 5173 | Web UI | CloudFront, S3 |
| **Backend** | Express + JWT + AWS SDK | 3000 | API Server, Authentication | Lambda, API Gateway |
| **Agent** | Express + Strands Agents SDK | 8080 | AI Agent Runtime | AgentCore Runtime, AgentCore Memory, Amazon Bedrock |
| **CLI** | Commander.js | - | Command-line Interface | Cognito (JWT Auth) |
| **CDK** | AWS CDK + TypeScript | - | Infrastructure as Code | CloudFormation |
| **Lambda Tools** | AWS Lambda + MCP | - | AgentCore Gateway Tools | Lambda, Bedrock Knowledge Base |

## ✨ Key Features

- **Production-Ready**: Well-architected full-stack implementation with security best practices
- **Amazon Bedrock Integration**: Seamless integration with Claude models and other foundation models
- **Memory & Context**: Built-in session management with AgentCore Memory
- **File Operations**: S3-based storage for user files and agent data
- **Authentication**: Cognito-based JWT authentication system
- **Extensible**: MCP (Model Context Protocol) support for custom tools
- **Development-Friendly**: Hot reload, Docker support, and comprehensive development tools

## 🚀 Deployment

<details>
<summary><strong>Prerequisites</strong></summary>

- **Node.js 22.12.0+** (Version management with [n](https://github.com/tj/n), see `.node-version`)
- **AWS CLI** configured with appropriate credentials
- **Amazon Bedrock Model Access**: Enable required models in your AWS account
  - Text generation models (e.g., Claude Sonnet)
  - Image generation models (if using image features)
  - Video generation models (if using video features)
  - Check [`/packages/cdk/cdk.json`](/packages/cdk/cdk.json) for model IDs and regions

</details>

### Deploy to AWS

#### 1. **Install dependencies**

```bash
npm ci
```

#### 2. **Configure Secrets (Optional)**

Store API keys and tokens in AWS Secrets Manager for your target environment:

**Tavily API Key** (for web search tools):

```bash
aws secretsmanager create-secret \
  --name "agentcore/default/tavily-api-key" \
  --secret-string "tvly-your-api-key-here" \
  --region ap-northeast-1
```

> Get your API key from [Tavily](https://tavily.com/)

**GitHub Token** (for GitHub CLI integration):

```bash
aws secretsmanager create-secret \
  --name "agentcore/default/github-token" \
  --secret-string "ghp_your-token-here" \
  --region ap-northeast-1
```

> Generate a token from [GitHub Settings](https://github.com/settings/tokens). See [GitHub CLI Integration Guide](docs/github-cli-integration.md) for details.

**Note**: For local development, you can also set these as environment variables in `packages/agent/.env`.

#### 3. **Bootstrap CDK (first time only)**
```bash
npx -w packages/cdk cdk bootstrap
```

#### 4. **Deploy the stack**

```bash
# Deploy to default region (based on AWS CLI configuration)
npm run deploy

# Deploy to a specific region
AWS_REGION=eu-west-1 AWS_DEFAULT_REGION=eu-west-1 CDK_DEFAULT_REGION=eu-west-1 npm run deploy
```
After deployment, the CloudFormation stack outputs will include the Frontend URL. Open the URL in your browser to start using the application


## 📖 Documentation

- [🔧 Local Development Guide](docs/DEVELOPMENT.md) - For developers
- [💻 Local Development Setup](docs/local-development-setup.md) - Environment setup automation
- [🔐 JWT Authentication System](docs/jwt-authentication.md) - Authentication details
- [📊 Architecture Diagram](docs/fullstack-agentcore-architecture.drawio.png)

## 🛠️ Development

For local development, see the [Development Guide](docs/DEVELOPMENT.md) which covers:
- Project structure and organization
- Running services locally with hot reload
- Docker-based development
- npm scripts reference
- Testing and debugging

## 📝 License

This project is licensed under the MIT License. See the LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🔗 Related Resources

- [Amazon Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Strands Agents SDK](https://github.com/awslabs/multi-agent-orchestrator)
