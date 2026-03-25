# AgentCore Runtime Agent

A package for running TypeScript-based Strands Agent on Amazon Bedrock AgentCore Runtime.

## Features

- 🤖 **Strands AI Agent**: AI agent implementation
- 🚀 **AgentCore Runtime Compatible**: Implements `/ping` and `/invocations` endpoints
- 🐳 **Docker Support**: Containerized execution environment
- 🔐 **AWS Authentication**: Supports credential mounting for local development

## Quick Start

### Prerequisites

- Node.js 22.12.0+
- Docker & Docker Compose
- AWS CLI configured (`aws configure` or SSO)

### 1. Local Development (Node.js)

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run build

# Start development server
npm run dev
```

### 2. Docker Development Environment (Recommended)

```bash
# Start Docker Compose with AWS credentials
npm run docker:dev

# Start in background
npm run docker:dev:detach

# View logs
npm run docker:logs

# Health check
npm run docker:test

# Stop
npm run docker:stop
```

## API Endpoints

### Health Check

```bash
curl http://localhost:8080/ping
```

**Response Example:**

```json
{
  "status": "Healthy",
  "time_of_last_update": 1766024243
}
```

### Agent Invocation

```bash
echo -n "Tell me the weather in Tokyo" | curl -X POST http://localhost:8080/invocations \
  -H "Content-Type: application/octet-stream" \
  --data-binary @-
```

**Response Example:**

```json
{
  "response": {
    "type": "agentResult",
    "stopReason": "endTurn",
    "lastMessage": {
      "type": "message",
      "role": "assistant",
      "content": [
        {
          "type": "textBlock",
          "text": "Tokyo Weather Information:\nTemperature: 22°C\nConditions: Sunny\nHumidity: 65%\nWind Speed: 5 km/h"
        }
      ]
    }
  }
}
```

## Available Tools

### Local Tools

Tools under `./src/tools` are available.

### MCP Server Integration

This agent supports **Model Context Protocol (MCP)** and can be extended with tools in three ways:

1. **Via AgentCore Gateway** - Remote MCP servers (automatic)
2. **Local stdio MCP Servers** - Command-line tools
3. **Remote HTTP/SSE MCP Servers** - Web APIs

#### mcp.json Configuration File

To use local MCP servers, create an `mcp.json` file in the project root:

```bash
# Copy sample file
cp mcp.json.example mcp.json

# Edit as needed
vi mcp.json
```

#### Configuration Examples

```json
{
  "mcpServers": {
    "aws-docs": {
      "transport": "stdio",
      "command": "uvx",
      "args": ["awslabs.aws-documentation-mcp-server@latest"],
      "enabled": true
    },
    "github": {
      "transport": "stdio",
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", 
               "ghcr.io/github/github-mcp-server"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      },
      "enabled": false
    },
    "github-copilot": {
      "transport": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GITHUB_PAT}"
      },
      "enabled": false
    }
  }
}
```

#### Transport Types

| Transport | Description | Use Case |
|-----------|-------------|----------|
| `stdio` | Communication with local process | CLI tools, Docker containers |
| `http` | Via Streamable HTTP | Remote Web APIs |
| `sse` | Via Server-Sent Events | Real-time communication |

#### Environment Variable Expansion

You can reference environment variables using `${VAR_NAME}` format:

```json
{
  "env": {
    "API_KEY": "${MY_API_KEY}",
    "REGION": "${AWS_REGION}"
  }
}
```

#### Enabling/Disabling MCP Servers

Each server can be controlled with the `enabled` field (default: `true`):

```json
{
  "aws-docs": {
    "transport": "stdio",
    "command": "uvx",
    "args": ["awslabs.aws-documentation-mcp-server@latest"],
    "enabled": true  // Enable this server
  },
  "filesystem": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    "enabled": false  // Disable this server
  }
}
```

#### Specifying Config File Path

By default, `./mcp.json` is loaded, but can be changed with an environment variable:

```bash
export MCP_CONFIG_PATH=/path/to/custom-mcp.json
npm run dev
```

#### Popular MCP Servers

- **AWS Documentation**: `awslabs.aws-documentation-mcp-server@latest`
- **GitHub**: `ghcr.io/github/github-mcp-server`
- **Filesystem**: `@modelcontextprotocol/server-filesystem`
- **Tavily Search**: `tavily-mcp@0.1.2`

See [MCP Server List](https://github.com/modelcontextprotocol/servers) for more details.

## AWS Authentication Setup

### ⚠️ Important Limitations

**`credential_process` Limitations in Docker Environment**:

- `credential_process` using certain authentication tools may not work inside Docker containers
- This is a technical limitation, not an issue with this implementation
- **In AgentCore Runtime production environment, IAM roles are automatically configured, so this issue does not occur**

### Method 1: .env.local File (Recommended)

Set authentication credentials using a local environment variable file:

```bash
# Create .env.local file
cat > .env.local << EOF
AWS_ACCESS_KEY_ID=<YOUR_ACCESS_KEY_ID>
AWS_SECRET_ACCESS_KEY=<YOUR_SECRET_ACCESS_KEY>
AWS_SESSION_TOKEN=<YOUR_SESSION_TOKEN>
AWS_REGION=us-west-2
EOF

# Start Docker
npm run docker:dev:aws
```

### Method 2: Local Script (for isengardcli)

Convenience script for Amazon internal users with isengardcli:

```bash
# Copy template
cp scripts/get-aws-credentials.local.sh.example scripts/get-aws-credentials.local.sh

# Edit email and role as needed
vi scripts/get-aws-credentials.local.sh

# Start Docker
npm run docker:dev:aws
```

**Features:**

- Automatically retrieves credentials from isengardcli
- Saves to `.env.local` file
- Displays expiration time
- Includes error handling

### Method 3: Direct Environment Variable Setup

```bash
# Set credentials directly
export AWS_ACCESS_KEY_ID="<YOUR_ACCESS_KEY_ID>"
export AWS_SECRET_ACCESS_KEY="<YOUR_SECRET_ACCESS_KEY>"
export AWS_SESSION_TOKEN="<YOUR_SESSION_TOKEN>"  # If needed
export AWS_REGION="us-west-2"

# Start Docker
npm run docker:dev
```

### Method 4: AWS SSO (for standard authentication)

```bash
# AWS SSO login
aws sso login

# Output temporary credentials to .env.local
aws sts get-session-token --duration-seconds 3600 --output json | \
  jq -r '"AWS_ACCESS_KEY_ID=" + .Credentials.AccessKeyId,
         "AWS_SECRET_ACCESS_KEY=" + .Credentials.SecretAccessKey,
         "AWS_SESSION_TOKEN=" + .Credentials.SessionToken,
         "AWS_REGION=us-west-2"' > .env.local

# Start Docker Compose
npm run docker:dev:aws
```

### Production Environment Notes

**In AgentCore Runtime**:

- ✅ IAM roles are automatically configured
- ✅ Access permissions to Bedrock and CloudWatch Logs are automatically granted
- ✅ Manual credential setup is not required
- ✅ This authentication issue does not occur

**In Local Development**:

- ⚠️ `credential_process` limitations exist
- 💡 Please use the alternative methods above

## Workspace Synchronization

AgentCore Runtime downloads user files from S3 on startup and uploads them on shutdown.

### Exclusion Settings with .syncignore

You can specify files to exclude from synchronization using `.gitignore`-style pattern matching.

#### Usage

Create a `.syncignore` file in the workspace root directory:

```bash
# .syncignore
# Comment lines

# Custom patterns
secrets/
*.key
*.pem
test-data/
*.zip
```

#### Default Exclusion Patterns

Even without a `.syncignore` file, the following are automatically excluded:

```
# System files
.DS_Store
Thumbs.db
*.swp
*.swo
*~

# Build artifacts
node_modules/
__pycache__/
*.pyc
.gradle/
build/
dist/
target/

# IDE settings
.idea/
.vscode/
*.iml

# Log files
*.log
logs/

# Temporary files
*.tmp
*.temp
.cache/

# .syncignore itself
.syncignore
```

#### Pattern Notation

| Pattern | Description | Example |
|---------|-------------|---------|
| `*.ext` | Extension match | `*.log` → All .log files |
| `dir/` | Directory exclusion | `secrets/` → Entire secrets directory |
| `*pattern*` | Partial match | `*-old.*` → Files containing -old. |
| `!pattern` | Negation (exception) | `!important.log` → Don't exclude this file |

#### Behavior Specification

- **On Download**: Applies exclusion patterns when downloading from S3
- **On Upload**: Applies exclusion patterns when uploading from local to S3
- **Custom Pattern Loading**: Loads custom patterns after downloading `.syncignore` from S3

#### Usage Example

```bash
# Create .syncignore in project root
cat > .syncignore << EOF
# Sensitive information
credentials/
*.env
*.pem

# Large files
*.mp4
*.zip
data/large-dataset/

# Test data
test-fixtures/
mock-data/
EOF
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | HTTP server port |
| `AWS_REGION` | us-east-1 | AWS region |
| `NODE_ENV` | development | Node.js environment |
| `LOG_LEVEL` | info | Log level |
| `AGENTCORE_GATEWAY_ENDPOINT` | - | AgentCore Gateway MCP endpoint (required) |
| `AGENTCORE_MEMORY_ID` | - | AgentCore Memory ID |
| `BEDROCK_MODEL_ID` | global.anthropic.claude-sonnet-4-6 | Bedrock model ID |
| `BEDROCK_REGION` | us-east-1 | Bedrock API region |
| `TAVILY_API_KEY_SECRET_NAME` | - | Secrets Manager name for Tavily API key |
| `GITHUB_TOKEN_SECRET_NAME` | - | Secrets Manager name for GitHub token |
| `GITLAB_TOKEN_SECRET_NAME` | - | Secrets Manager name for GitLab token |
| `GITLAB_HOST` | gitlab.com | GitLab instance hostname |
| `CONVERSATION_WINDOW_SIZE` | 40 | Conversation window size (even number ≥ 2) |
| `ENABLE_PROMPT_CACHING` | true | Enable prompt caching |
| `DEBUG_MCP` | false | Enable MCP debug logging |
| `AWS_PROFILE` | - | AWS profile name |
| `CACHE_TYPE` | default | Prompt cache type (default or ephemeral) |

## Deployment

### Deploy to AgentCore Runtime

```bash
# Deploy CDK stack
cd ../cdk
npx cdk deploy

# Check output Runtime ID
# AgentCoreStack.AgentRuntimeId = StrandsAgentsTS-XXXXXXXXXX
```

### Test in Agent Sandbox

1. AWS Console → Amazon Bedrock → Agent Sandbox
2. Select Runtime ID: `StrandsAgentsTS-XXXXXXXXXX`
3. Test with "Tell me the weather in Tokyo"

## Troubleshooting

### AWS Authentication Error

```
Could not load credentials from any providers
```

**Resolution:**

- Verify AWS CLI is configured: `aws configure list`
- For SSO: `aws sso login`
- Check Docker volume mount is correct

### Docker Startup Error

```bash
# Completely remove container and restart
docker-compose down --volumes
npm run docker:dev
```

### Port Conflict Error

```bash
# If port 8080 is in use
docker-compose down
lsof -ti:8080 | xargs kill -9
npm run docker:dev
```

## Development

### File Structure

```
packages/agent/
├── src/
│   ├── index.ts          # HTTP server
│   ├── agent.ts          # Strands Agent definition
│   └── tools/
│       └── weather.ts    # Weather tool
├── Dockerfile            # Docker image configuration
├── docker-compose.yml    # Development environment setup
└── package.json          # npm scripts
```

### Adding Custom Tools

1. Create tool file in `src/tools/`
2. Add tool in `src/agent.ts`
3. Build with `npm run build`
4. Test with `npm run docker:dev`

Example:

```typescript
import { tool } from "@strands-agents/sdk";
import { z } from "zod";

export const myCustomTool = tool({
  name: "my_custom_tool",
  description: "Description of custom tool",
  inputSchema: z.object({
    input: z.string().describe("Input parameter"),
  }),
  callback: (input) => {
    return `Custom tool result: ${input.input}`;
  },
});
```

## License

MIT
