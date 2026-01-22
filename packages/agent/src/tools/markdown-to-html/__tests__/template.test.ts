import { generateHtmlDocument, escapeHtml, CSS_STYLES } from '../template.js';

describe('HTML Template', () => {
  describe('escapeHtml', () => {
    it('should escape ampersand', () => {
      expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    it('should escape less than', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('should escape greater than', () => {
      expect(escapeHtml('a > b')).toBe('a &gt; b');
    });

    it('should escape double quotes', () => {
      expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
    });

    it('should escape single quotes', () => {
      expect(escapeHtml("it's")).toBe('it&#39;s');
    });

    it('should escape multiple special characters', () => {
      expect(escapeHtml('<a href="test">link</a>')).toBe(
        '&lt;a href=&quot;test&quot;&gt;link&lt;/a&gt;'
      );
    });

    it('should handle empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should handle string with no special characters', () => {
      expect(escapeHtml('normal text')).toBe('normal text');
    });
  });

  describe('CSS_STYLES', () => {
    it('should include CSS variables', () => {
      expect(CSS_STYLES).toContain('--gray-50: #f9fafb');
      expect(CSS_STYLES).toContain('--gray-900: #111827');
      expect(CSS_STYLES).toContain('--blue-600: #2563eb');
    });

    it('should include body styles', () => {
      expect(CSS_STYLES).toContain('body {');
      expect(CSS_STYLES).toContain('max-width: 800px');
      expect(CSS_STYLES).toContain('font-family:');
    });

    it('should include heading styles', () => {
      expect(CSS_STYLES).toContain('h1, h2, h3, h4, h5, h6 {');
      expect(CSS_STYLES).toContain('h1 {');
    });

    it('should include table styles', () => {
      expect(CSS_STYLES).toContain('table {');
      expect(CSS_STYLES).toContain('th, td {');
    });

    it('should include code styles', () => {
      expect(CSS_STYLES).toContain('code {');
      expect(CSS_STYLES).toContain('pre {');
    });

    it('should include task list styles', () => {
      expect(CSS_STYLES).toContain('ul.task-list');
    });

    it('should include responsive media queries', () => {
      expect(CSS_STYLES).toContain('@media (max-width: 640px)');
    });

    it('should include print media queries', () => {
      expect(CSS_STYLES).toContain('@media print');
    });
  });

  describe('generateHtmlDocument', () => {
    it('should generate valid HTML5 document', () => {
      const result = generateHtmlDocument('Test Title', '<p>Content</p>');

      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<html lang="ja">');
      expect(result).toContain('</html>');
    });

    it('should include head section with meta tags', () => {
      const result = generateHtmlDocument('Test', '<p>Content</p>');

      expect(result).toContain('<head>');
      expect(result).toContain('<meta charset="UTF-8">');
      expect(result).toContain('<meta name="viewport"');
      expect(result).toContain('</head>');
    });

    it('should include escaped title', () => {
      const result = generateHtmlDocument('Test & "Title"', '<p>Content</p>');

      expect(result).toContain('<title>Test &amp; &quot;Title&quot;</title>');
    });

    it('should include CSS styles in style tag', () => {
      const result = generateHtmlDocument('Test', '<p>Content</p>');

      expect(result).toContain('<style>');
      expect(result).toContain(CSS_STYLES);
      expect(result).toContain('</style>');
    });

    it('should include body content', () => {
      const bodyContent = '<h1>Hello</h1><p>World</p>';
      const result = generateHtmlDocument('Test', bodyContent);

      expect(result).toContain('<body>');
      expect(result).toContain(bodyContent);
      expect(result).toContain('</body>');
    });

    it('should handle empty body content', () => {
      const result = generateHtmlDocument('Empty', '');

      expect(result).toContain('<body>');
      expect(result).toContain('</body>');
    });

    it('should handle Japanese title', () => {
      const result = generateHtmlDocument('日本語タイトル', '<p>内容</p>');

      expect(result).toContain('<title>日本語タイトル</title>');
    });
  });
});
