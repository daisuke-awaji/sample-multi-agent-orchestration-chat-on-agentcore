Language: [English](./README.md) / [Japanese](./README-ja.md)

# Donuts

An AI agent platform built on Amazon Bedrock AgentCore.

## Overview

Donuts is a multi-agent platform that enables teams to **freely create and customize** AI agents and share them across your organization. Built on Amazon Bedrock AgentCore, you can easily build agents tailored to your needs.

Preset agents are also available for immediate use, covering various domains including software development, data analysis, and content creation.

<div align="center">
  <table>
    <tr>
      <td width="50%">
        <img src="./docs/assets/agentchat.geeawa.net_chat.png" alt="Chat Interface" width="100%">
        <p align="center"><b>Intuitive Chat Interface</b><br/>You can interact with specialized AI agents through a simple UI</p>
      </td>
      <td width="50%">
        <img src="./docs/assets/agentchat.geeawa.net_chat_share_agent.png" alt="Agent Sharing" width="100%">
        <p align="center"><b>Organization-Wide Agent Sharing</b><br/>You can discover and share custom agents across your team</p>
      </td>
    </tr>
    <tr>
      <td width="50%">
        <img src="./docs/assets/agentchat.geeawa.net_event_integration.png" alt="Event Integration" width="100%">
        <p align="center"><b>Event-Driven Automation</b><br/>Trigger agents automatically via schedules and external events</p>
      </td>
      <td width="50%">
        <img src="./docs/assets/agentchat.geeawa.net_tools.png" alt="Tools" width="100%">
        <p align="center"><b>Extensible Tools</b><br/>Add and configure tools to extend agent capabilities</p>
      </td>
    </tr>
  </table>
</div>

### Key Highlights

- **Custom Agent Creation** - You can design and build agents freely according to your needs
- **Organization-Wide Sharing** - You can discover and share agents across your team
- **Preset Agents** - Ready-to-use agents including Software Developer, Data Analyst, Physicist, and more
- **Extensible Tools** - Supports command execution, web search, image generation, and external service integration
- **File Storage** - Includes built-in cloud storage for documents and resources
- **Enterprise Ready** - Supports JWT authentication, session management, and AWS Cognito integration
- **Memory and Context** - Recognizes persistent conversation history and context

## Architecture

<div align="center">
  <img src="./docs/donuts-architecture.drawio.png" alt="Architecture Diagram" width="80%">
</div>

## Deployment

<details>
<summary><strong>Prerequisites</strong></summary>

The following environment is required for deployment.

- **Node.js 22.12.0+** - Version management with [n](https://github.com/tj/n) is recommended. See `.node-version`.
- **AWS CLI** - Must be configured with appropriate credentials.

</details>

### Deploy to AWS

#### 1. Install dependencies

First, install the dependencies.

```bash
npm ci
```

#### 2. Configure Secrets (Optional)

If needed, store API keys and tokens in AWS Secrets Manager for your target environment.

**Tavily API Key** (for web search tools)

```bash
aws secretsmanager create-secret \
  --name "agentcore/default/tavily-api-key" \
  --secret-string "tvly-your-api-key-here" \
  --region ap-northeast-1
```

You can get your API key from [Tavily](https://tavily.com/).

**GitHub Token** (for GitHub CLI integration)

```bash
aws secretsmanager create-secret \
  --name "agentcore/default/github-token" \
  --secret-string "ghp_your-token-here" \
  --region ap-northeast-1
```

You can generate a token from [GitHub Settings](https://github.com/settings/tokens).

For local development, you can also set these as environment variables in `packages/agent/.env`.

#### 3. Bootstrap CDK (first time only)

For the first deployment, run CDK bootstrap.

```bash
npx -w packages/cdk cdk bootstrap
```

#### 4. Deploy the stack

Deploy the stack with the following commands.

```bash
# Deploy to default region
npm run deploy

# Deploy to dev environment
npm run deploy:dev

# Deploy to staging environment
npm run deploy:stg

# Deploy to production environment
npm run deploy:prd
```

After deployment, you can find the Frontend URL in the CloudFormation stack outputs.


## Documentation

### User Guides
- [User Guide (English)](docs/USER_GUIDE.md) - Feature introduction and end-user guide
- [User Guide (Japanese)](docs/USER_GUIDE-ja.md) - Feature introduction and end-user guide

### Technical Documentation
- [Local Development Setup](docs/local-development-setup.md) - Explains environment setup automation
- [JWT Authentication System](docs/jwt-authentication.md) - Explains the authentication mechanism
- [Architecture Diagram](docs/donuts-architecture.drawio.png)

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## Contributing

Contributions are welcome. Please feel free to submit a Pull Request.

## Related Resources

- [Amazon Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Strands Agents SDK](https://strandsagents.com/)
- [AgentCore Gateway & M365 Integration Guide](https://github.com/akadesilva/agentcore-gateway-demos/blob/main/guides/sharepoint-quickstart.md)

---

<p align="center">
  <sub><sup>This is an experimental repository for personal use and learning purposes.</sup></sub>
</p>
