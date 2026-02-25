import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { loadEnvFile } from '../load-env.js';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('loadEnvFile', () => {
  let tempDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'load-env-test-'));
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  function trackEnv(key: string) {
    savedEnv[key] = process.env[key];
  }

  it('should load key-value pairs from a file', () => {
    const envFile = join(tempDir, '.env');
    writeFileSync(envFile, 'TEST_LOAD_ENV_A=hello\nTEST_LOAD_ENV_B=world\n');
    trackEnv('TEST_LOAD_ENV_A');
    trackEnv('TEST_LOAD_ENV_B');

    loadEnvFile(envFile);

    expect(process.env.TEST_LOAD_ENV_A).toBe('hello');
    expect(process.env.TEST_LOAD_ENV_B).toBe('world');
  });

  it('should not override existing env vars by default', () => {
    const envFile = join(tempDir, '.env');
    writeFileSync(envFile, 'TEST_LOAD_ENV_EXIST=new_value\n');
    trackEnv('TEST_LOAD_ENV_EXIST');
    process.env.TEST_LOAD_ENV_EXIST = 'original';

    loadEnvFile(envFile);

    expect(process.env.TEST_LOAD_ENV_EXIST).toBe('original');
  });

  it('should override existing env vars when override option is set', () => {
    const envFile = join(tempDir, '.env');
    writeFileSync(envFile, 'TEST_LOAD_ENV_OVERRIDE=overridden\n');
    trackEnv('TEST_LOAD_ENV_OVERRIDE');
    process.env.TEST_LOAD_ENV_OVERRIDE = 'original';

    loadEnvFile(envFile, { override: true });

    expect(process.env.TEST_LOAD_ENV_OVERRIDE).toBe('overridden');
  });

  it('should skip comments and blank lines', () => {
    const envFile = join(tempDir, '.env');
    writeFileSync(envFile, '# comment\n\nTEST_LOAD_ENV_C=value\n  # another comment\n');
    trackEnv('TEST_LOAD_ENV_C');

    loadEnvFile(envFile);

    expect(process.env.TEST_LOAD_ENV_C).toBe('value');
  });

  it('should strip surrounding quotes', () => {
    const envFile = join(tempDir, '.env');
    writeFileSync(envFile, 'TEST_LOAD_ENV_D="quoted"\nTEST_LOAD_ENV_E=\'single\'\n');
    trackEnv('TEST_LOAD_ENV_D');
    trackEnv('TEST_LOAD_ENV_E');

    loadEnvFile(envFile);

    expect(process.env.TEST_LOAD_ENV_D).toBe('quoted');
    expect(process.env.TEST_LOAD_ENV_E).toBe('single');
  });

  it('should silently skip missing files', () => {
    expect(() => loadEnvFile('/nonexistent/path/.env')).not.toThrow();
  });

  it('should handle values containing equals signs', () => {
    const envFile = join(tempDir, '.env');
    writeFileSync(envFile, 'TEST_LOAD_ENV_EQ=a=b=c\n');
    trackEnv('TEST_LOAD_ENV_EQ');

    loadEnvFile(envFile);

    expect(process.env.TEST_LOAD_ENV_EQ).toBe('a=b=c');
  });
});
