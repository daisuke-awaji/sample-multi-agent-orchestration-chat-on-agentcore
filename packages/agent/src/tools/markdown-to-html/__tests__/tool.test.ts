import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { convertMarkdownToHtml } from '../converter.js';

describe('Markdown to HTML Tool', () => {
  const testDir = '/tmp/markdown-to-html-test';
  const testMdFile = join(testDir, 'test.md');
  const testOutputFile = join(testDir, 'output.html');

  beforeAll(() => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean up test files before each test
    if (existsSync(testMdFile)) {
      rmSync(testMdFile);
    }
    if (existsSync(testOutputFile)) {
      rmSync(testOutputFile);
    }
  });

  describe('file-based conversion', () => {
    it('should convert markdown file content to HTML', () => {
      const markdown = '# Hello World\n\nThis is a test.';
      writeFileSync(testMdFile, markdown, 'utf8');

      const markdownContent = readFileSync(testMdFile, 'utf8');
      const html = convertMarkdownToHtml(markdownContent, 'Test');

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<h1>Hello World</h1>');
      expect(html).toContain('<p>This is a test.</p>');

      writeFileSync(testOutputFile, html, 'utf8');
      expect(existsSync(testOutputFile)).toBe(true);
    });

    it('should use custom title', () => {
      const markdown = '# Content';
      const html = convertMarkdownToHtml(markdown, 'Custom Report Title');

      expect(html).toContain('<title>Custom Report Title</title>');
    });

    it('should handle Japanese content', () => {
      const markdown = '# 日本語レポート\n\nこれはテストです。';
      const html = convertMarkdownToHtml(markdown, '日本語タイトル');

      expect(html).toContain('<title>日本語タイトル</title>');
      expect(html).toContain('日本語レポート');
      expect(html).toContain('これはテストです');
    });
  });

  describe('complex markdown', () => {
    it('should convert markdown with tables', () => {
      const markdown = `# Report

| Name | Value |
| --- | --- |
| A | 100 |
| B | 200 |`;

      const html = convertMarkdownToHtml(markdown, 'Report');

      expect(html).toContain('<table>');
      expect(html).toContain('<th>Name</th>');
      expect(html).toContain('<td>100</td>');
    });

    it('should convert markdown with code blocks', () => {
      const markdown = '# Code\n\n```typescript\nconst x = 1;\n```';
      const html = convertMarkdownToHtml(markdown, 'Code');

      expect(html).toContain('<pre>');
      expect(html).toContain('const x = 1;');
    });

    it('should convert markdown with task lists', () => {
      const markdown = '# Tasks\n\n- [x] Done\n- [ ] Todo';
      const html = convertMarkdownToHtml(markdown, 'Tasks');

      expect(html).toContain('task-list');
      expect(html).toContain('checked');
    });
  });

  describe('title extraction from filename', () => {
    it('should convert kebab-case filename to title', () => {
      const mdFile = join(testDir, 'my-report-2026.md');
      writeFileSync(mdFile, '# Content', 'utf8');

      // Simulate title extraction logic
      const filename = 'my-report-2026';
      const title = filename.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      const html = convertMarkdownToHtml('# Content', title);
      expect(html).toContain('<title>My Report 2026</title>');

      rmSync(mdFile);
    });

    it('should convert snake_case filename to title', () => {
      const filename = 'analysis_report_2026';
      const title = filename.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      const html = convertMarkdownToHtml('# Content', title);
      expect(html).toContain('<title>Analysis Report 2026</title>');
    });
  });
});
