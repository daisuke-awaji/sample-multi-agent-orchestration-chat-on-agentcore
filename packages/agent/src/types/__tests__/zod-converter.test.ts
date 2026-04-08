import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { sanitizePropertyKey, convertToZodSchema } from '../zod-converter.js';

describe('sanitizePropertyKey', () => {
  it('should return normal key unchanged', () => {
    expect(sanitizePropertyKey('validKey')).toBe('validKey');
  });

  it('should return key with allowed special chars unchanged', () => {
    expect(sanitizePropertyKey('key_name.value-1')).toBe('key_name.value-1');
  });

  it('should replace special characters with underscores', () => {
    expect(sanitizePropertyKey('key name')).toBe('key_name');
    expect(sanitizePropertyKey('key/name')).toBe('key_name');
    expect(sanitizePropertyKey('key@name')).toBe('key_name');
  });

  it('should truncate key longer than 64 characters', () => {
    const longKey = 'a'.repeat(70);
    const result = sanitizePropertyKey(longKey);
    expect(result.length).toBe(64);
    expect(result).toBe('a'.repeat(64));
  });

  it('should NOT truncate key that is exactly 64 characters', () => {
    const key64 = 'b'.repeat(64);
    expect(sanitizePropertyKey(key64)).toBe(key64);
  });

  it('should NOT truncate key between 33-63 characters (below threshold)', () => {
    const key50 = 'validKey_' + 'c'.repeat(41); // 50 chars total
    expect(sanitizePropertyKey(key50)).toBe(key50);
    expect(sanitizePropertyKey(key50).length).toBe(50);
  });

  it('should return _param for empty string', () => {
    expect(sanitizePropertyKey('')).toBe('_param');
  });

  it('should return underscores when all characters are special', () => {
    const result = sanitizePropertyKey('!@#$%^&*()');
    expect(result).toBe('__________');
  });

  it('should handle alphanumeric keys unchanged', () => {
    expect(sanitizePropertyKey('abc123')).toBe('abc123');
  });
});

describe('convertToZodSchema', () => {
  it('should return empty schema for null jsonSchema', () => {
    const { schema, keyMapping } = convertToZodSchema(null as never);
    expect(schema).toBeInstanceOf(z.ZodObject);
    expect(Object.keys(keyMapping)).toHaveLength(0);
  });

  it('should return empty schema for undefined jsonSchema', () => {
    const { schema, keyMapping } = convertToZodSchema(undefined as never);
    expect(schema).toBeInstanceOf(z.ZodObject);
    expect(Object.keys(keyMapping)).toHaveLength(0);
  });

  it('should return empty schema when type is not object', () => {
    const { schema, keyMapping } = convertToZodSchema({ type: 'string' });
    expect(schema).toBeInstanceOf(z.ZodObject);
    expect(Object.keys(keyMapping)).toHaveLength(0);
  });

  it('should return empty schema for object with no properties', () => {
    const { schema, keyMapping } = convertToZodSchema({ type: 'object' });
    expect(schema).toBeInstanceOf(z.ZodObject);
    expect(Object.keys(keyMapping)).toHaveLength(0);
  });

  it('should convert string type', () => {
    const { schema } = convertToZodSchema({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    });
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    expect(shape.name).toBeInstanceOf(z.ZodString);
  });

  it('should convert number type', () => {
    const { schema } = convertToZodSchema({
      type: 'object',
      properties: { count: { type: 'number' } },
      required: ['count'],
    });
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    expect(shape.count).toBeInstanceOf(z.ZodNumber);
  });

  it('should convert integer type to ZodNumber', () => {
    const { schema } = convertToZodSchema({
      type: 'object',
      properties: { age: { type: 'integer' } },
      required: ['age'],
    });
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    expect(shape.age).toBeInstanceOf(z.ZodNumber);
  });

  it('should convert boolean type', () => {
    const { schema } = convertToZodSchema({
      type: 'object',
      properties: { active: { type: 'boolean' } },
      required: ['active'],
    });
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    expect(shape.active).toBeInstanceOf(z.ZodBoolean);
  });

  it('should convert array type', () => {
    const { schema } = convertToZodSchema({
      type: 'object',
      properties: { items: { type: 'array' } },
      required: ['items'],
    });
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    expect(shape.items).toBeInstanceOf(z.ZodArray);
  });

  it('should convert object type to ZodRecord', () => {
    const { schema } = convertToZodSchema({
      type: 'object',
      properties: { data: { type: 'object' } },
      required: ['data'],
    });
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    expect(shape.data).toBeInstanceOf(z.ZodRecord);
  });

  it('should convert unknown type to ZodUnknown', () => {
    const { schema } = convertToZodSchema({
      type: 'object',
      properties: { misc: { type: 'unknown_type' } },
      required: ['misc'],
    });
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    expect(shape.misc).toBeInstanceOf(z.ZodUnknown);
  });

  it('should make required fields non-optional', () => {
    const { schema } = convertToZodSchema({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    });
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    expect(shape.name instanceof z.ZodOptional).toBe(false);
    expect(schema.parse({ name: 'test' })).toEqual({ name: 'test' });
  });

  it('should make non-required fields optional', () => {
    const { schema } = convertToZodSchema({
      type: 'object',
      properties: { name: { type: 'string' } },
    });
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    expect(shape.name).toBeInstanceOf(z.ZodOptional);
    expect(schema.parse({})).toEqual({});
  });

  it('should attach description to field', () => {
    const { schema } = convertToZodSchema({
      type: 'object',
      properties: { name: { type: 'string', description: 'The user name' } },
      required: ['name'],
    });
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    expect(shape.name.description).toBe('The user name');
  });

  it('should sanitize property keys and populate keyMapping', () => {
    const { schema, keyMapping } = convertToZodSchema({
      type: 'object',
      properties: { 'key name': { type: 'string' } },
      required: ['key name'],
    });
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    expect(shape['key_name']).toBeDefined();
    expect(keyMapping['key_name']).toBe('key name');
  });

  it('should handle empty properties object', () => {
    const { schema, keyMapping } = convertToZodSchema({
      type: 'object',
      properties: {},
    });
    expect(Object.keys(schema.shape)).toHaveLength(0);
    expect(Object.keys(keyMapping)).toHaveLength(0);
  });
});
