import { z } from 'zod';
import { JSONSchema, JSONSchemaProperty } from './types.js';

/**
 * プロパティキー名をサニタイズ（Bedrock の制約に適合させる）
 * パターン: ^[a-zA-Z0-9_.-]{1,64}$
 */
export function sanitizePropertyKey(key: string): string {
  // 許可されていない文字をアンダースコアに置換
  let sanitized = key.replace(/[^a-zA-Z0-9_.-]/g, '_');

  // 64文字に切り詰め
  if (sanitized.length > 64) {
    sanitized = sanitized.substring(0, 64);
  }

  // 空文字の場合はデフォルト名
  if (sanitized.length === 0) {
    sanitized = '_param';
  }

  return sanitized;
}

/**
 * JSON Schema を Zod Schema に変換し、キーマッピングも返す
 */
export function convertToZodSchema(jsonSchema: JSONSchema): {
  schema: z.ZodObject<Record<string, z.ZodTypeAny>>;
  keyMapping: Record<string, string>; // sanitizedKey -> originalKey
} {
  if (!jsonSchema || jsonSchema.type !== 'object') {
    return { schema: z.object({}), keyMapping: {} };
  }

  const properties = jsonSchema.properties || {};
  const required = jsonSchema.required || [];
  const zodFields: Record<string, z.ZodTypeAny> = {};
  const keyMapping: Record<string, string> = {};

  for (const [key, prop] of Object.entries(properties)) {
    const propSchema = prop as JSONSchemaProperty;

    // プロパティキー名をサニタイズ
    const sanitizedKey = sanitizePropertyKey(key);
    keyMapping[sanitizedKey] = key; // マッピングを記録

    let zodType: z.ZodTypeAny;

    switch (propSchema.type) {
      case 'string':
        zodType = z.string();
        break;
      case 'number':
      case 'integer':
        zodType = z.number();
        break;
      case 'boolean':
        zodType = z.boolean();
        break;
      case 'array':
        zodType = z.array(z.unknown());
        break;
      case 'object':
        zodType = z.record(z.string(), z.unknown());
        break;
      default:
        zodType = z.unknown();
    }

    if (propSchema.description) {
      zodType = zodType.describe(propSchema.description);
    }

    if (!required.includes(key)) {
      zodType = zodType.optional();
    }

    zodFields[sanitizedKey] = zodType;
  }

  return { schema: z.object(zodFields), keyMapping };
}
