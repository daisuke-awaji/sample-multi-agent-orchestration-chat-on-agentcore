# Machine User Testing Guide

This guide explains how to test the Agent API using Client Credentials Flow (machine user authentication) for local development.

## Overview

The `test-machine-user.ts` script allows you to test the `/invocations` API endpoint with machine user authentication. This is useful for:

- Testing batch processing scenarios
- Simulating server-to-server authentication
- Testing the `targetUserId` parameter functionality
- Verifying Client Credentials Flow integration

## Prerequisites

1. **Cognito User Pool** with an App Client configured for Client Credentials Flow
2. **Machine User App Client** with:
   - Client Credentials Flow enabled
   - Client Secret generated
   - (Optional) Custom OAuth scopes configured
3. **Target User ID** - A valid user in your Cognito User Pool
4. **Local Agent Server** running on port 8080 (or custom port)

## Setup

### 1. Configure Cognito App Client

Create or configure an App Client in your Cognito User Pool:

```bash
# Via AWS Console:
# 1. Open Cognito > User Pools > [Your Pool] > App integration > App clients
# 2. Create new app client or edit existing
# 3. Enable "Client credentials" in "Allowed OAuth Flows"
# 4. Generate client secret
# 5. (Optional) Add custom scopes under OAuth 2.0 scopes
```

### 2. Set Environment Variables

Copy the example environment file and fill in your values:

```bash
cp scripts/test-machine-user.env.example scripts/test-machine-user.env
```

Edit `scripts/test-machine-user.env`:

```bash
# Required
COGNITO_DOMAIN=your-domain.auth.ap-northeast-1.amazoncognito.com
MACHINE_CLIENT_ID=your-machine-client-id
MACHINE_CLIENT_SECRET=your-machine-client-secret
TARGET_USER_ID=user@example.com

# Optional
AGENT_ENDPOINT=http://localhost:8080/invocations
COGNITO_SCOPE=agentcore/batch.execute
```

**Note:** The script automatically loads the `.env` file using dotenv. You don't need to manually source it.

## Usage

### Basic Usage

Test with a simple prompt:

```bash
npx tsx scripts/test-machine-user.ts --prompt "Hello, this is a test message"
```

### With Options

```bash
# Specify model
npx tsx scripts/test-machine-user.ts \
  --prompt "Explain quantum computing" \
  --model-id "anthropic.claude-3-5-sonnet-20241022-v2:0"

# With custom system prompt
npx tsx scripts/test-machine-user.ts \
  --prompt "Write a haiku" \
  --system-prompt "You are a creative poet"

# With session ID for conversation continuity
npx tsx scripts/test-machine-user.ts \
  --prompt "What did I ask before?" \
  --session-id "session-123"
```

### CLI Options

| Option | Short | Description | Required |
|--------|-------|-------------|----------|
| `--prompt` | `-p` | Test prompt text | Yes |
| `--model-id` | `-m` | Bedrock model ID | No |
| `--system-prompt` | | Custom system prompt | No |
| `--session-id` | `-s` | Session ID for continuity | No |
| `--help` | `-h` | Show help message | No |

## Example Output

```bash
$ npx tsx scripts/test-machine-user.ts --prompt "What is 2+2?"

📄 Loading environment from: /path/to/scripts/test-machine-user.env
🔐 Requesting access token with Client Credentials Flow...
✅ Access token obtained successfully
   Token type: Bearer
   Expires in: 3600 seconds
   Token payload: {
     "sub": "client-id-123",
     "token_use": "access",
     "scope": "agentcore/batch.execute",
     "client_id": "machine-client-id"
   }

🚀 Calling Agent API...
   Endpoint: http://localhost:8080/invocations
   Target User ID: user@example.com
   Prompt: What is 2+2?
   Request body: {
     "prompt": "What is 2+2?",
     "targetUserId": "user@example.com"
   }
✅ Agent API response received, processing stream...

2 + 2 equals 4.

📝 Complete Assistant Response:
────────────────────────────────────────────────────────────────────────────────
2 + 2 equals 4.
────────────────────────────────────────────────────────────────────────────────

✅ Request completed successfully
   Metadata: {
     "requestId": "test-req-123",
     "duration": 1250,
     "sessionId": null,
     "actorId": "user@example.com",
     "conversationLength": 2
   }

✅ Test completed successfully
```

## Troubleshooting

### Error: "COGNITO_DOMAIN environment variable is required"

Make sure you've created and filled in the `.env` file:

```bash
cp scripts/test-machine-user.env.example scripts/test-machine-user.env
# Edit scripts/test-machine-user.env with your values
```

The script automatically loads this file, so you don't need to source it manually.

### Error: "Token request failed: 400 Bad Request"

Check that:
- Your `MACHINE_CLIENT_ID` and `MACHINE_CLIENT_SECRET` are correct
- The App Client has Client Credentials Flow enabled
- The Cognito domain is correct (without `https://`)

### Error: "targetUserId is required for machine user"

This means the agent correctly detected you as a machine user but didn't receive the `targetUserId` parameter. Make sure:
- `TARGET_USER_ID` environment variable is set in `scripts/test-machine-user.env`
- The script is passing it correctly (this should be automatic)

### Error: "User ID resolution failed: targetUserId is not allowed for regular users"

This means the token is being detected as a regular user token instead of a machine user token. Check:
- You're using the correct App Client (one with Client Credentials Flow)
- The token doesn't have `username` or `cognito:username` claims

### Connection Refused

Make sure the Agent server is running:

```bash
# In another terminal
npm run agent:dev
```

## Advanced Usage

### Override Environment Variables

You can override specific environment variables per request:

```bash
TARGET_USER_ID=another-user@example.com npx tsx scripts/test-machine-user.ts \
  --prompt "Test message"
```

### Testing Different Endpoints

```bash
# Test against deployed Agent API
AGENT_ENDPOINT=https://your-agent-api.example.com/invocations \
  npx tsx scripts/test-machine-user.ts \
  --prompt "Test message"
```

### Using Different .env Files

The script loads from `scripts/test-machine-user.env` by default. To use a different file:

```bash
# Create alternative environment file
cp scripts/test-machine-user.env scripts/test-machine-user.staging.env
# Edit with staging credentials

# Override by setting environment variables directly
COGNITO_DOMAIN=staging-domain.auth.ap-northeast-1.amazoncognito.com \
MACHINE_CLIENT_ID=staging-client-id \
MACHINE_CLIENT_SECRET=staging-secret \
TARGET_USER_ID=staging-user@example.com \
  npx tsx scripts/test-machine-user.ts --prompt "Test"
```

### Integration with CI/CD

```bash
#!/bin/bash
# test-machine-user-ci.sh

# CI environment variables override .env file
export COGNITO_DOMAIN=$CI_COGNITO_DOMAIN
export MACHINE_CLIENT_ID=$CI_MACHINE_CLIENT_ID
export MACHINE_CLIENT_SECRET=$CI_MACHINE_CLIENT_SECRET
export TARGET_USER_ID=$CI_TARGET_USER_ID
export AGENT_ENDPOINT=$CI_AGENT_ENDPOINT

npx tsx scripts/test-machine-user.ts \
  --prompt "Health check test" \
  --model-id "anthropic.claude-3-haiku-20240307-v1:0"

if [ $? -eq 0 ]; then
  echo "✅ Machine user test passed"
  exit 0
else
  echo "❌ Machine user test failed"
  exit 1
fi
```

## Environment File Management

### File Structure

```
scripts/
├── test-machine-user.ts              # Main test script
├── test-machine-user.env.example     # Example environment file
└── test-machine-user.env            # Your actual credentials (gitignored)
```

### Security Best Practices

⚠️ **Important Security Considerations:**

1. **Never commit credentials**: The `test-machine-user.env` file is automatically excluded via `.gitignore`
2. **Rotate secrets regularly**: Update `MACHINE_CLIENT_SECRET` periodically
3. **Limit scope**: Configure minimal OAuth scopes needed for testing
4. **Use IAM roles in production**: Don't use client credentials in production; use IAM roles with proper permissions
5. **Audit access**: Monitor machine user access in CloudWatch Logs
6. **Keep .env.example updated**: When adding new environment variables, update the example file

### Multiple Environments

You can maintain different environment files for different environments:

```bash
scripts/
├── test-machine-user.env              # Default (local)
├── test-machine-user.staging.env     # Staging credentials
└── test-machine-user.production.env  # Production credentials
```

## Dependencies

The script requires:
- **Node.js** >= 22.12.0
- **tsx** - TypeScript execution engine (included in devDependencies)
- **dotenv** - Environment variable loader (included in devDependencies)

These are automatically installed when you run `npm install` in the project root.

## Related Documentation

- [JWT Authentication Guide](./jwt-authentication.md)
- [Machine User Detection Fix](./fix-machine-user-detection.md)
- [Local Development Setup](./local-development-setup.md)

## Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section above
2. Review the agent server logs
3. Check Cognito CloudWatch logs for authentication issues
4. Verify your `.env` file has all required values set
