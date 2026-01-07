# AgentCore Runtime Agent Dockerfile
# Multi-stage build for optimized image size with monorepo workspace support

# ========================================
# Stage 1: Build
# ========================================
FROM node:22-slim AS builder

WORKDIR /build

# Copy workspace root package files
COPY package*.json ./
COPY tsconfig.base.json ./

# Copy all workspace package.json files
COPY packages/agent/package*.json ./packages/agent/
COPY packages/agent/tsconfig.json ./packages/agent/
COPY packages/shared/tool-definitions/package*.json ./packages/shared/tool-definitions/
COPY packages/shared/tool-definitions/tsconfig.json ./packages/shared/tool-definitions/

# Install all dependencies (including workspace dependencies)
RUN npm ci

# Copy source code for all required packages
COPY packages/shared/tool-definitions/src/ ./packages/shared/tool-definitions/src/
COPY packages/agent/src/ ./packages/agent/src/
COPY packages/agent/scripts/ ./packages/agent/scripts/

# Build shared packages first
RUN cd packages/shared/tool-definitions && npm run build

# Build agent package
RUN cd packages/agent && npm run build

# ========================================
# Stage 2: Production
# ========================================
FROM node:22-slim

# Install required tools (Python, AWS CLI, GitHub CLI, uv)
RUN apt-get update && apt-get install -y \
    curl \
    python3 \
    python3-pip \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install AWS CLI
RUN pip3 install awscli --break-system-packages

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
    dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | \
    tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && \
    apt-get install -y gh && \
    rm -rf /var/lib/apt/lists/*

# Install uv/uvx for Python MCP servers
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/uv && \
    mv /root/.local/bin/uvx /usr/local/bin/uvx && \
    chmod +x /usr/local/bin/uv /usr/local/bin/uvx

WORKDIR /app

# Copy workspace root package files
COPY package*.json ./

# Copy workspace package.json files
COPY packages/agent/package*.json ./packages/agent/
COPY packages/shared/tool-definitions/package*.json ./packages/shared/tool-definitions/

# Install production dependencies only (skip scripts like husky)
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built files from builder stage
COPY --from=builder /build/packages/shared/tool-definitions/dist ./packages/shared/tool-definitions/dist
COPY --from=builder /build/packages/shared/tool-definitions/package.json ./packages/shared/tool-definitions/
COPY --from=builder /build/packages/agent/dist ./packages/agent/dist
COPY --from=builder /build/packages/agent/scripts ./packages/agent/scripts

# Set working directory to agent package
WORKDIR /app/packages/agent

# Make startup script executable
RUN chmod +x scripts/startup.sh

# Expose port 8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/ping || exit 1

# Start application via entrypoint script
CMD ["./scripts/startup.sh"]
