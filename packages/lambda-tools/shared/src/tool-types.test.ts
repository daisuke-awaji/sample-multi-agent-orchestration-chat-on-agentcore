import { ToolError, ToolValidationError, AccessDeniedError } from './tool-types';

describe('ToolError', () => {
  it('should set message and toolName correctly', () => {
    const error = new ToolError('something went wrong', 'my-tool');
    expect(error.message).toBe('something went wrong');
    expect(error.toolName).toBe('my-tool');
    expect(error.name).toBe('ToolError');
  });

  it('should be an instance of Error', () => {
    const error = new ToolError('fail', 'tool');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ToolError);
  });

  it('should optionally accept a cause error', () => {
    const cause = new Error('root cause');
    const error = new ToolError('wrapper', 'tool', cause);
    expect(error.cause).toBe(cause);
    expect(error.cause?.message).toBe('root cause');
  });

  it('should have a stack trace', () => {
    const error = new ToolError('msg', 'tool');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('ToolError');
  });
});

describe('ToolValidationError', () => {
  it('should set message, toolName, and field', () => {
    const error = new ToolValidationError('invalid input', 'query-tool', 'query');
    expect(error.message).toBe('invalid input');
    expect(error.toolName).toBe('query-tool');
    expect(error.field).toBe('query');
    expect(error.name).toBe('ToolValidationError');
  });

  it('should be an instance of ToolError and Error', () => {
    const error = new ToolValidationError('bad', 'tool');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ToolError);
    expect(error).toBeInstanceOf(ToolValidationError);
  });

  it('should work without optional field parameter', () => {
    const error = new ToolValidationError('missing param', 'tool');
    expect(error.field).toBeUndefined();
  });
});

describe('AccessDeniedError', () => {
  it('should set message, toolName, and resource', () => {
    const error = new AccessDeniedError('forbidden', 'athena-query', 'secret_db');
    expect(error.message).toBe('forbidden');
    expect(error.toolName).toBe('athena-query');
    expect(error.resource).toBe('secret_db');
    expect(error.name).toBe('AccessDeniedError');
  });

  it('should be an instance of ToolError and Error', () => {
    const error = new AccessDeniedError('no access', 'tool');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ToolError);
    expect(error).toBeInstanceOf(AccessDeniedError);
  });

  it('should work without optional resource parameter', () => {
    const error = new AccessDeniedError('denied', 'tool');
    expect(error.resource).toBeUndefined();
  });
});