# AgentCore Runtime Agent Dockerfile
# Multi-stage build for optimized image size with monorepo workspace support

# ========================================
# Stage 1: Build
# ========================================
FROM public.ecr.aws/docker/library/node:22-slim AS builder

WORKDIR /build

# Copy entire monorepo (.dockerignore controls what's excluded)
COPY . .

# Install all dependencies and build
# 1. tsc --build: builds shared libs with dependency resolution (generative-ui-catalog → tool-definitions → s3-workspace-sync)
# 2. npm run build: builds agent package
RUN npm ci
RUN npx tsc --build tsconfig.build.json --force
RUN npm run build --workspace=@moca/agent

# ========================================
# Stage 2: Production
# ========================================
FROM public.ecr.aws/docker/library/node:22-slim

# Install required tools (Python, AWS CLI, GitHub CLI, GitLab CLI, uv)
RUN apt-get update && apt-get install -y \
    curl \
    git \
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

# Install GitLab CLI (glab)
RUN ARCH=$(dpkg --print-architecture) && \
    GLAB_VERSION=$(curl -fsSL "https://gitlab.com/api/v4/projects/gitlab-org%2Fcli/releases/permalink/latest" | grep -o '"tag_name":"v[^"]*"' | head -1 | sed 's/"tag_name":"v\(.*\)"/\1/') && \
    curl -fsSL "https://gitlab.com/gitlab-org/cli/-/releases/v${GLAB_VERSION}/downloads/glab_${GLAB_VERSION}_linux_${ARCH}.deb" -o /tmp/glab.deb && \
    dpkg -i /tmp/glab.deb && \
    rm /tmp/glab.deb && \
    glab --version

# Install uv/uvx for Python MCP servers
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/uv && \
    mv /root/.local/bin/uvx /usr/local/bin/uvx && \
    chmod +x /usr/local/bin/uv /usr/local/bin/uvx

WORKDIR /app

# Copy workspace root package files for npm workspace resolution
COPY --chown=node:node package*.json ./
COPY --chown=node:node packages/agent/package.json ./packages/agent/
COPY --chown=node:node packages/libs/tool-definitions/package.json ./packages/libs/tool-definitions/
COPY --chown=node:node packages/libs/s3-workspace-sync/package.json ./packages/libs/s3-workspace-sync/
COPY --chown=node:node packages/libs/generative-ui-catalog/package.json ./packages/libs/generative-ui-catalog/

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built artifacts from builder stage
COPY --chown=node:node --from=builder /build/packages/agent/dist ./packages/agent/dist
COPY --chown=node:node --from=builder /build/packages/agent/scripts ./packages/agent/scripts
COPY --chown=node:node --from=builder /build/packages/libs/tool-definitions/dist ./packages/libs/tool-definitions/dist
COPY --chown=node:node --from=builder /build/packages/libs/s3-workspace-sync/dist ./packages/libs/s3-workspace-sync/dist
COPY --chown=node:node --from=builder /build/packages/libs/generative-ui-catalog/dist ./packages/libs/generative-ui-catalog/dist

# Set working directory to agent package
WORKDIR /app/packages/agent

# Make startup script executable
RUN chmod +x scripts/startup.sh

# Expose port 8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/ping || exit 1

# Run as non-root user for security
USER node

# Start application via entrypoint script
CMD ["./scripts/startup.sh"]