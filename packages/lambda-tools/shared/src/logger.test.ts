/**
 * Tests for the Logger class
 *
 * Since logger is a singleton, we need to be careful about state between tests.
 * We spy on console methods to verify output without polluting test output.
 */

// We need to import the logger from the module
// The logger is a singleton, so we test it directly
import { logger } from './logger';

describe('Logger', () => {
  let consoleSpy: {
    log: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };
    // Reset logger state
    logger.setLogLevel('DEBUG');
    logger.setRequestId(undefined as unknown as string);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('log levels', () => {
    it('should output INFO logs via console.log', () => {
      logger.info('TEST_TAG', { key: 'value' });

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const output = consoleSpy.log.mock.calls[0][0];
      expect(output).toContain('[TEST_TAG]');
      expect(output).toContain('"key":"value"');
    });

    it('should output WARN logs via console.warn', () => {
      logger.warn('WARN_TAG', { warning: true });

      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      const output = consoleSpy.warn.mock.calls[0][0];
      expect(output).toContain('[WARN_TAG]');
    });

    it('should output ERROR logs via console.error', () => {
      logger.error('ERR_TAG', { fatal: true });

      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      const output = consoleSpy.error.mock.calls[0][0];
      expect(output).toContain('[ERR_TAG]');
    });

    it('should output DEBUG logs via console.log when level is DEBUG', () => {
      logger.setLogLevel('DEBUG');
      logger.debug('DBG_TAG', { debug: true });

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const output = consoleSpy.log.mock.calls[0][0];
      expect(output).toContain('[DBG_TAG]');
    });
  });

  describe('log level filtering', () => {
    it('should suppress DEBUG when log level is INFO', () => {
      logger.setLogLevel('INFO');
      logger.debug('SUPPRESSED', { data: 'hidden' });

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should suppress INFO and DEBUG when log level is WARN', () => {
      logger.setLogLevel('WARN');
      logger.debug('SUPPRESSED', {});
      logger.info('SUPPRESSED', {});

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should only allow ERROR when log level is ERROR', () => {
      logger.setLogLevel('ERROR');
      logger.debug('SUPPRESSED', {});
      logger.info('SUPPRESSED', {});
      logger.warn('SUPPRESSED', {});
      logger.error('ALLOWED', { error: true });

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('request ID injection', () => {
    it('should inject request ID into log output when set', () => {
      logger.setRequestId('req-xyz-123');
      logger.info('TAG', { action: 'test' });

      const output = consoleSpy.log.mock.calls[0][0];
      expect(output).toContain('req-xyz-123');
    });

    it('should not include reqId when not set', () => {
      // reqId is undefined from beforeEach reset
      logger.info('TAG', { action: 'test' });

      const output = consoleSpy.log.mock.calls[0][0];
      // Parse the JSON part to check
      const jsonMatch = output.match(/\[TAG\] (.+)/);
      expect(jsonMatch).toBeTruthy();
      const data = JSON.parse(jsonMatch![1]);
      expect(data.reqId).toBeUndefined();
    });
  });

  describe('error object serialization', () => {
    it('should serialize Error objects into JSON-friendly format', () => {
      const err = new Error('test error');
      logger.error('ERR', { error: err });

      const output = consoleSpy.error.mock.calls[0][0];
      const jsonMatch = output.match(/\[ERR\] (.+)/);
      const data = JSON.parse(jsonMatch![1]);

      expect(data.error.message).toBe('test error');
      expect(data.error.name).toBe('Error');
      expect(data.error.stack).toBeDefined();
    });
  });

  describe('createContext', () => {
    it('should create a context object with request ID', () => {
      logger.setRequestId('req-ctx-test');
      const ctx = logger.createContext({ action: 'something' });

      expect(ctx.reqId).toBe('req-ctx-test');
      expect(ctx.action).toBe('something');
    });

    it('should create a context without reqId when not set', () => {
      const ctx = logger.createContext({ action: 'test' });
      expect(ctx.reqId).toBeUndefined();
      expect(ctx.action).toBe('test');
    });
  });

  describe('createTimestampedContext', () => {
    it('should include a timestamp in ISO format', () => {
      const ctx = logger.createTimestampedContext({ key: 'value' });

      expect(ctx.timestamp).toBeDefined();
      expect(typeof ctx.timestamp).toBe('string');
      // Verify it is a valid ISO string
      expect(new Date(ctx.timestamp as string).toISOString()).toBe(ctx.timestamp);
      expect(ctx.key).toBe('value');
    });
  });

  describe('measureExecution', () => {
    it('should execute the function and return its result', () => {
      logger.setLogLevel('DEBUG');
      const result = logger.measureExecution('PERF', () => 42);

      expect(result).toBe(42);
    });

    it('should log performance on success', () => {
      logger.setLogLevel('DEBUG');
      logger.measureExecution('TEST', () => 'done');

      // Should have logged a DEBUG message with durationMs
      expect(consoleSpy.log).toHaveBeenCalled();
      const output = consoleSpy.log.mock.calls[0][0];
      expect(output).toContain('TEST_PERF');
      expect(output).toContain('durationMs');
    });

    it('should log error and re-throw when function throws', () => {
      logger.setLogLevel('DEBUG');

      expect(() => {
        logger.measureExecution('FAIL', () => {
          throw new Error('boom');
        });
      }).toThrow('boom');

      expect(consoleSpy.error).toHaveBeenCalled();
      const output = consoleSpy.error.mock.calls[0][0];
      expect(output).toContain('FAIL_PERF_ERROR');
    });
  });
});