import { createHandler } from './handler-factory';
import { Context } from 'aws-lambda';
import { ToolInput, AgentCoreResponse } from './types';

/**
 * Create a minimal mock Lambda Context
 */
function createMockContext(overrides: Partial<Context> = {}): Context {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789:function:test-function',
    memoryLimitInMB: '128',
    awsRequestId: 'req-12345',
    logGroupName: '/aws/lambda/test-function',
    logStreamName: '2026/02/17/[$LATEST]abc123',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
    ...overrides,
  };
}

describe('createHandler', () => {
  it('should return a function', () => {
    const handler = createHandler({
      getToolHandler: () => async () => ({ ok: true }),
      defaultToolName: 'test-default',
    });

    expect(typeof handler).toBe('function');
  });

  it('should call the tool handler and return result with metadata on success', async () => {
    const mockToolHandler = jest.fn(async () => ({ data: 'hello', count: 42 }));
    const handler = createHandler({
      getToolHandler: () => mockToolHandler,
      defaultToolName: 'my-tool',
    });

    const event: ToolInput = { query: 'test' };
    const context = createMockContext({ awsRequestId: 'req-abc123' });

    const response: AgentCoreResponse = await handler(event, context);

    expect(mockToolHandler).toHaveBeenCalledWith(event);
    expect(response.result).toEqual({ data: 'hello', count: 42 });
    expect(response.error).toBeUndefined();
    expect(response.metadata).toBeDefined();
    expect(response.metadata.requestId).toBe('req-abc123');
    expect(response.metadata.timestamp).toBeDefined();
  });

  it('should return error response when tool handler throws', async () => {
    const handler = createHandler({
      getToolHandler: () => async () => {
        throw new Error('Something broke');
      },
      defaultToolName: 'my-tool',
    });

    const event: ToolInput = { query: 'test' };
    const context = createMockContext({ awsRequestId: 'req-err456' });

    const response: AgentCoreResponse = await handler(event, context);

    expect(response.result).toBeNull();
    expect(response.error).toBe('Something broke');
    expect(response.metadata.requestId).toBe('req-err456');
  });

  it('should handle non-Error thrown values', async () => {
    const handler = createHandler({
      getToolHandler: () => async () => {
        throw 'string error';
      },
      defaultToolName: 'my-tool',
    });

    const event: ToolInput = {};
    const context = createMockContext();

    const response: AgentCoreResponse = await handler(event, context);

    expect(response.result).toBeNull();
    expect(response.error).toBe('Unknown error');
  });

  it('should pass toolName through getToolHandler', async () => {
    const getToolHandler = jest.fn(() => async () => ({ ok: true }));
    const handler = createHandler({
      getToolHandler,
      defaultToolName: 'default',
    });

    const context = createMockContext({
      clientContext: {
        custom: {
          bedrockAgentCoreToolName: 'my-custom-tool',
        },
      } as unknown as Context['clientContext'],
    });

    await handler({}, context);

    // extractToolName should extract 'my-custom-tool' and pass to getToolHandler
    expect(getToolHandler).toHaveBeenCalledWith('my-custom-tool');
  });

  it('should pass null to getToolHandler when no tool name in context', async () => {
    const getToolHandler = jest.fn(() => async () => ({ ok: true }));
    const handler = createHandler({
      getToolHandler,
      defaultToolName: 'default',
    });

    const context = createMockContext(); // no clientContext

    await handler({}, context);

    expect(getToolHandler).toHaveBeenCalledWith(null);
  });

  it('should include timestamp in ISO format in metadata', async () => {
    const handler = createHandler({
      getToolHandler: () => async () => ({ ok: true }),
      defaultToolName: 'tool',
    });

    const response = await handler({}, createMockContext());

    // Verify timestamp is valid ISO string
    const timestamp = response.metadata.timestamp;
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });
});