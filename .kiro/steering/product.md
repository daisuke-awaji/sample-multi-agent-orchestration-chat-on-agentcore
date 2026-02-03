# Product Overview

Donuts is a multi-agent AI platform built on Amazon Bedrock AgentCore that enables teams to create, customize, and share AI agents across their organization.

## Core Capabilities

- **Custom Agent Creation**: Design and build specialized AI agents tailored to specific needs
- **Organization-Wide Sharing**: Discover and share agents across teams through an agent directory
- **Preset Agents**: Ready-to-use agents for software development, data analysis, content creation, and more
- **Extensible Tools**: Command execution, web search (Tavily), image generation (Nova Canvas), video generation (Nova Reel), code interpretation, and external service integration via MCP
- **File Storage**: Built-in S3-backed cloud storage for documents and resources
- **Event-Driven Automation**: Trigger agents automatically via EventBridge schedules and custom events
- **Memory & Context**: Persistent conversation history with short-term (session) and long-term (AgentCore Memory) support

## Architecture

Fully serverless architecture on AWS:
- **Frontend**: React SPA hosted on CloudFront + S3
- **Auth**: Amazon Cognito with JWT authentication
- **API**: Lambda + API Gateway (Express.js)
- **Agent Runtime**: AgentCore Runtime with Strands Agents SDK (TypeScript)
- **Storage**: DynamoDB for sessions/metadata, S3 for files
- **Real-time**: AppSync Events for WebSocket streaming
- **Events**: EventBridge Scheduler for automated agent execution

## Target Users

Development teams and organizations looking to leverage AI agents for automation, analysis, and productivity enhancement with enterprise-grade security and scalability.
