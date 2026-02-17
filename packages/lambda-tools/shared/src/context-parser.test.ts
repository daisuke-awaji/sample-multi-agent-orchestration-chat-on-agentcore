import { extractToolName, extractActualToolName, getContextSummary } from './context-parser';
import { Context } from 'aws-lambda';

/**
 * Create a minimal mock Lambda Context object
 */
function createMockContext(overrides: Partial<Context> = {}): Context {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789:function:test-function',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/test-function',
    logStreamName: '2026/02/17/[$LATEST]abc123',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
    ...overrides,
  };
}

describe('extractToolName', () => {
  it('should extract tool name from clientContext with bedrockAgentCoreToolName', () => {
    const context = createMockContext({
      clientContext: {
        custom: {
          bedrockAgentCoreToolName: 'echo',
        },
      } as unknown as Context['clientContext'],
    });

    const result = extractToolName(context);
    expect(result).toBe('echo');
  });

  it('should strip gateway target prefix from tool name', () => {
    const context = createMockContext({
      clientContext: {
        custom: {
          bedrockAgentCoreToolName: 'athena-tools___athena-query',
        },
      } as unknown as Context['clientContext'],
    });

    const result = extractToolName(context);
    expect(result).toBe('athena-query');
  });

  it('should return null when clientContext is undefined', () => {
    const context = createMockContext({ clientContext: undefined });
    const result = extractToolName(context);
    expect(result).toBeNull();
  });

  it('should return null when custom context is missing', () => {
    const context = createMockContext({
      clientContext: {} as unknown as Context['clientContext'],
    });
    const result = extractToolName(context);
    expect(result).toBeNull();
  });

  it('should return null when bedrockAgentCoreToolName is not set', () => {
    const context = createMockContext({
      clientContext: {
        custom: {
          someOtherField: 'value',
        },
      } as unknown as Context['clientContext'],
    });
    const result = extractToolName(context);
    expect(result).toBeNull();
  });

  it('should return null when bedrockAgentCoreToolName is empty string', () => {
    const context = createMockContext({
      clientContext: {
        custom: {
          bedrockAgentCoreToolName: '',
        },
      } as unknown as Context['clientContext'],
    });
    const result = extractToolName(context);
    expect(result).toBeNull();
  });
});

describe('extractActualToolName', () => {
  it('should return the tool name after ___ delimiter', () => {
    expect(extractActualToolName('echo-tool___echo')).toBe('echo');
  });

  it('should return the tool name when multiple ___ delimiters exist', () => {
    expect(extractActualToolName('prefix___middle___actual')).toBe('middle___actual');
  });

  it('should return the same name when no delimiter exists', () => {
    expect(extractActualToolName('simple-tool')).toBe('simple-tool');
  });

  it('should return empty string for empty input', () => {
    expect(extractActualToolName('')).toBe('');
  });

  it('should handle delimiter at the start', () => {
    expect(extractActualToolName('___tool-name')).toBe('tool-name');
  });

  it('should handle delimiter at the end', () => {
    expect(extractActualToolName('tool-name___')).toBe('');
  });
});

describe('getContextSummary', () => {
  it('should return structured context summary', () => {
    const context = createMockContext({
      functionName: 'my-lambda',
      functionVersion: '$LATEST',
      memoryLimitInMB: '256',
    });

    const summary = getContextSummary(context);

    expect(summary.functionName).toBe('my-lambda');
    expect(summary.functionVersion).toBe('$LATEST');
    expect(summary.memoryLimit).toBe('256');
    expect(summary.remainingTime).toBe(30000);
    expect(summary.hasClientContext).toBe(false);
    expect(summary.clientContextKeys).toEqual([]);
  });

  it('should detect clientContext when present', () => {
    const context = createMockContext({
      clientContext: {
        custom: { tool: 'test' },
      } as unknown as Context['clientContext'],
    });

    const summary = getContextSummary(context);
    expect(summary.hasClientContext).toBe(true);
    expect(summary.clientContextKeys).toContain('custom');
  });
});