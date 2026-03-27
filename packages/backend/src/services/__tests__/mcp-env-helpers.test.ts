/**
 * Unit tests for mcp-env-helpers
 * Tests extractEnvFromMcpConfig and restoreEnvToMcpConfig
 */

import { describe, it, expect } from '@jest/globals';
import { extractEnvFromMcpConfig, restoreEnvToMcpConfig } from '../mcp-env-helpers.js';
import type { MCPConfig } from '../agents-service.js';

describe('extractEnvFromMcpConfig', () => {
  it('extracts env values and returns cleaned config without env fields', () => {
    const mcpConfig: MCPConfig = {
      mcpServers: {
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_TOKEN: 'ghp_xxx' },
        },
        slack: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-slack'],
          env: { SLACK_BOT_TOKEN: 'xoxb-xxx' },
        },
      },
    };

    const { cleanedConfig, envMap } = extractEnvFromMcpConfig(mcpConfig);

    // Cleaned config should not have env fields
    expect(cleanedConfig.mcpServers.github.env).toBeUndefined();
    expect(cleanedConfig.mcpServers.slack.env).toBeUndefined();

    // Cleaned config should retain other fields
    expect(cleanedConfig.mcpServers.github.command).toBe('npx');
    expect(cleanedConfig.mcpServers.github.args).toEqual([
      '-y',
      '@modelcontextprotocol/server-github',
    ]);
    expect(cleanedConfig.mcpServers.slack.command).toBe('npx');

    // envMap should contain extracted env values
    expect(envMap).not.toBeNull();
    expect(envMap!.github).toEqual({ GITHUB_TOKEN: 'ghp_xxx' });
    expect(envMap!.slack).toEqual({ SLACK_BOT_TOKEN: 'xoxb-xxx' });
  });

  it('returns null envMap when no servers have env values', () => {
    const mcpConfig: MCPConfig = {
      mcpServers: {
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
        },
      },
    };

    const { cleanedConfig, envMap } = extractEnvFromMcpConfig(mcpConfig);

    expect(envMap).toBeNull();
    expect(cleanedConfig.mcpServers.github.command).toBe('npx');
  });

  it('returns null envMap when env is an empty object', () => {
    const mcpConfig: MCPConfig = {
      mcpServers: {
        github: {
          command: 'npx',
          env: {},
        },
      },
    };

    const { envMap } = extractEnvFromMcpConfig(mcpConfig);
    expect(envMap).toBeNull();
  });

  it('handles mixed servers (some with env, some without)', () => {
    const mcpConfig: MCPConfig = {
      mcpServers: {
        withEnv: {
          command: 'node',
          env: { API_KEY: 'test-dummy-value' },
        },
        withoutEnv: {
          url: 'http://localhost:3000',
          transport: 'http' as const,
        },
      },
    };

    const { cleanedConfig, envMap } = extractEnvFromMcpConfig(mcpConfig);

    expect(envMap).not.toBeNull();
    expect(envMap!.withEnv).toEqual({ API_KEY: 'test-dummy-value' });
    expect(envMap!.withoutEnv).toBeUndefined();

    expect(cleanedConfig.mcpServers.withEnv.env).toBeUndefined();
    expect(cleanedConfig.mcpServers.withEnv.command).toBe('node');
    expect(cleanedConfig.mcpServers.withoutEnv.url).toBe('http://localhost:3000');
  });

  it('does not mutate the original mcpConfig', () => {
    const mcpConfig: MCPConfig = {
      mcpServers: {
        github: {
          command: 'npx',
          env: { TOKEN: 'value' },
        },
      },
    };

    extractEnvFromMcpConfig(mcpConfig);

    expect(mcpConfig.mcpServers.github.env).toEqual({ TOKEN: 'value' });
  });
});

describe('restoreEnvToMcpConfig', () => {
  it('restores env values from envMap into mcpConfig', () => {
    const mcpConfig: MCPConfig = {
      mcpServers: {
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
        },
        slack: {
          command: 'npx',
        },
      },
    };

    const envMap = {
      github: { GITHUB_TOKEN: 'ghp_xxx' },
      slack: { SLACK_BOT_TOKEN: 'xoxb-xxx' },
    };

    const restored = restoreEnvToMcpConfig(mcpConfig, envMap);

    expect(restored.mcpServers.github.env).toEqual({ GITHUB_TOKEN: 'ghp_xxx' });
    expect(restored.mcpServers.github.command).toBe('npx');
    expect(restored.mcpServers.slack.env).toEqual({ SLACK_BOT_TOKEN: 'xoxb-xxx' });
  });

  it('leaves servers without envMap entries unchanged', () => {
    const mcpConfig: MCPConfig = {
      mcpServers: {
        github: { command: 'npx' },
        other: { url: 'http://localhost:3000' },
      },
    };

    const envMap = {
      github: { GITHUB_TOKEN: 'ghp_xxx' },
    };

    const restored = restoreEnvToMcpConfig(mcpConfig, envMap);

    expect(restored.mcpServers.github.env).toEqual({ GITHUB_TOKEN: 'ghp_xxx' });
    expect(restored.mcpServers.other.env).toBeUndefined();
    expect(restored.mcpServers.other.url).toBe('http://localhost:3000');
  });

  it('does not mutate the original mcpConfig', () => {
    const mcpConfig: MCPConfig = {
      mcpServers: {
        github: { command: 'npx' },
      },
    };

    const envMap = { github: { TOKEN: 'value' } };

    restoreEnvToMcpConfig(mcpConfig, envMap);

    expect(mcpConfig.mcpServers.github.env).toBeUndefined();
  });

  it('handles empty envMap gracefully', () => {
    const mcpConfig: MCPConfig = {
      mcpServers: {
        github: { command: 'npx' },
      },
    };

    const restored = restoreEnvToMcpConfig(mcpConfig, {});

    expect(restored.mcpServers.github.env).toBeUndefined();
    expect(restored.mcpServers.github.command).toBe('npx');
  });
});

describe('extractEnvFromMcpConfig + restoreEnvToMcpConfig round-trip', () => {
  it('extract then restore produces the original mcpConfig', () => {
    const original: MCPConfig = {
      mcpServers: {
        github: {
          command: 'npx',
          args: ['-y', 'server-github'],
          env: { GITHUB_TOKEN: 'ghp_xxx', GITHUB_ORG: 'myorg' },
        },
        noenv: {
          url: 'http://localhost:8080',
          transport: 'http' as const,
        },
      },
    };

    const { cleanedConfig, envMap } = extractEnvFromMcpConfig(original);
    expect(envMap).not.toBeNull();

    const restored = restoreEnvToMcpConfig(cleanedConfig, envMap!);

    expect(restored.mcpServers.github.command).toBe('npx');
    expect(restored.mcpServers.github.args).toEqual(['-y', 'server-github']);
    expect(restored.mcpServers.github.env).toEqual({
      GITHUB_TOKEN: 'ghp_xxx',
      GITHUB_ORG: 'myorg',
    });
    expect(restored.mcpServers.noenv.url).toBe('http://localhost:8080');
    expect(restored.mcpServers.noenv.env).toBeUndefined();
  });
});