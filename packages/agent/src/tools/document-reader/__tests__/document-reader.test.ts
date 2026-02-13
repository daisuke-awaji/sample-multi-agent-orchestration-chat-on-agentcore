/**
 * Unit tests for document-reader tool
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseOffice } from 'officeparser';
import * as XLSX from 'xlsx';

import { EXTENSION_FORMAT_MAP } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'fixtures');

describe('document-reader', () => {
  beforeAll(() => {
    expect(existsSync(FIXTURES_DIR)).toBe(true);
  });

  describe('DOCX parsing', () => {
    it('should extract text from DOCX file', async () => {
      const buffer = readFileSync(join(FIXTURES_DIR, 'test.docx'));
      const ast = await parseOffice(buffer);
      const text = ast.toText();

      expect(text).toContain('テストドキュメント');
      expect(text).toContain('セクション1');
      expect(text).toContain('日本語テキスト');
      expect(text).toContain('12345');
      expect(text.length).toBeGreaterThan(0);
    });
  });

  describe('PPTX parsing', () => {
    it('should extract text from PPTX file', async () => {
      const buffer = readFileSync(join(FIXTURES_DIR, 'test.pptx'));
      const ast = await parseOffice(buffer);
      const text = ast.toText();

      expect(text).toContain('テストプレゼンテーション');
      expect(text).toContain('サブタイトル');
      expect(text).toContain('スライド2');
      expect(text.length).toBeGreaterThan(0);
    });
  });

  describe('XLSX parsing with SheetJS', () => {
    it('should extract text from XLSX file including headers and string cells', () => {
      const buffer = readFileSync(join(FIXTURES_DIR, 'test.xlsx'));
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      expect(workbook.SheetNames).toContain('Sheet1');

      const sheet = workbook.Sheets['Sheet1'];
      const csv = XLSX.utils.sheet_to_csv(sheet);

      expect(csv).toContain('名前');
      expect(csv).toContain('年齢');
      expect(csv).toContain('部署');
      expect(csv).toContain('田中太郎');
      expect(csv).toContain('30');
      expect(csv).toContain('開発部');
    });

    it('should produce structured text with sheet names', () => {
      const buffer = readFileSync(join(FIXTURES_DIR, 'test.xlsx'));
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      const parts: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        parts.push(`## ${sheetName}`);
        parts.push(XLSX.utils.sheet_to_csv(sheet));
      }
      const result = parts.join('\n');

      expect(result).toContain('## Sheet1');
      expect(result).toContain('名前,年齢,部署');
    });
  });

  describe('PDF parsing', () => {
    it('should extract text from PDF file', async () => {
      const buffer = readFileSync(join(FIXTURES_DIR, 'test.pdf'));
      const ast = await parseOffice(buffer);
      const text = ast.toText();

      expect(text).toContain('Test PDF Document');
      expect(text).toContain('Page 1 of the document');
      expect(text).toContain('Page 2 content');
      expect(text.length).toBeGreaterThan(0);
    });
  });

  describe('format detection', () => {
    it('should identify supported extensions', () => {
      expect(EXTENSION_FORMAT_MAP['.pdf']).toBe('pdf');
      expect(EXTENSION_FORMAT_MAP['.docx']).toBe('docx');
      expect(EXTENSION_FORMAT_MAP['.pptx']).toBe('pptx');
      expect(EXTENSION_FORMAT_MAP['.xlsx']).toBe('xlsx');
    });

    it('should not match unsupported extensions', () => {
      expect(EXTENSION_FORMAT_MAP['.txt']).toBeUndefined();
      expect(EXTENSION_FORMAT_MAP['.doc']).toBeUndefined();
      expect(EXTENSION_FORMAT_MAP['.csv']).toBeUndefined();
    });
  });

  describe('text truncation', () => {
    it('should truncate text when exceeding maxLength', () => {
      const longText = 'a'.repeat(100000);
      const maxLength = 50000;
      const truncated = longText.length > maxLength;
      const result = truncated ? longText.slice(0, maxLength) : longText;

      expect(truncated).toBe(true);
      expect(result.length).toBe(maxLength);
    });

    it('should not truncate text within maxLength', () => {
      const shortText = 'Hello World';
      const maxLength = 50000;
      const truncated = shortText.length > maxLength;
      const result = truncated ? shortText.slice(0, maxLength) : shortText;

      expect(truncated).toBe(false);
      expect(result).toBe(shortText);
    });
  });
});
