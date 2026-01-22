import { convertMarkdownToHtml, convertMarkdownToHtmlBody } from '../converter.js';

describe('Markdown to HTML Converter', () => {
  describe('convertMarkdownToHtmlBody', () => {
    it('should convert basic headings', () => {
      const markdown = '# Heading 1\n## Heading 2\n### Heading 3';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('<h1>Heading 1</h1>');
      expect(result).toContain('<h2>Heading 2</h2>');
      expect(result).toContain('<h3>Heading 3</h3>');
    });

    it('should convert paragraphs', () => {
      const markdown = 'This is a paragraph.\n\nThis is another paragraph.';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('<p>This is a paragraph.</p>');
      expect(result).toContain('<p>This is another paragraph.</p>');
    });

    it('should convert bold and italic text', () => {
      const markdown = '**bold** and *italic* and ***bold italic***';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('<em>italic</em>');
      expect(result).toContain('<em><strong>bold italic</strong></em>');
    });

    it('should convert strikethrough text (GFM)', () => {
      const markdown = '~~deleted~~';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('<del>deleted</del>');
    });

    it('should convert links', () => {
      const markdown = '[Link Text](https://example.com)';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('<a href="https://example.com">Link Text</a>');
    });

    it('should convert links inside list items', () => {
      const markdown = '- [GitHub](https://github.com)\n- [Google](https://google.com)';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('<a href="https://github.com">GitHub</a>');
      expect(result).toContain('<a href="https://google.com">Google</a>');
    });

    it('should convert bold and links inside list items', () => {
      const markdown = '- **Bold** and [Link](https://example.com)';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('<strong>Bold</strong>');
      expect(result).toContain('<a href="https://example.com">Link</a>');
    });

    it('should convert unordered lists', () => {
      const markdown = '- Item 1\n- Item 2\n- Item 3';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Item 1</li>');
      expect(result).toContain('<li>Item 2</li>');
      expect(result).toContain('<li>Item 3</li>');
      expect(result).toContain('</ul>');
    });

    it('should convert ordered lists', () => {
      const markdown = '1. First\n2. Second\n3. Third';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('<ol>');
      expect(result).toContain('<li>First</li>');
      expect(result).toContain('<li>Second</li>');
      expect(result).toContain('<li>Third</li>');
      expect(result).toContain('</ol>');
    });

    it('should convert task lists (GFM)', () => {
      const markdown = '- [ ] Todo\n- [x] Done';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('class="task-list"');
      expect(result).toContain('<input type="checkbox" disabled>');
      expect(result).toContain('<input type="checkbox" disabled checked>');
      expect(result).toContain('Todo');
      expect(result).toContain('Done');
    });

    it('should convert inline code', () => {
      const markdown = 'Use `const` for constants';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('<code>const</code>');
    });

    it('should convert code blocks', () => {
      const markdown = '```javascript\nconst x = 1;\n```';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('<pre>');
      expect(result).toContain('<code');
      expect(result).toContain('const x = 1;');
    });

    it('should convert mermaid code blocks to mermaid class', () => {
      const markdown = '```mermaid\ngraph TD\n    A --> B\n```';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('<pre class="mermaid">');
      expect(result).toContain('graph TD');
      expect(result).toContain('A --> B');
      expect(result).not.toContain('<code');
    });

    it('should convert blockquotes', () => {
      const markdown = '> This is a quote';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('<blockquote>');
      expect(result).toContain('This is a quote');
      expect(result).toContain('</blockquote>');
    });

    it('should convert horizontal rules', () => {
      const markdown = 'Before\n\n---\n\nAfter';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('<hr>');
    });

    it('should convert tables (GFM)', () => {
      const markdown = `| Header 1 | Header 2 |
| --- | --- |
| Cell 1 | Cell 2 |
| Cell 3 | Cell 4 |`;
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('<table>');
      expect(result).toContain('<th>Header 1</th>');
      expect(result).toContain('<th>Header 2</th>');
      expect(result).toContain('<td>Cell 1</td>');
      expect(result).toContain('<td>Cell 2</td>');
      expect(result).toContain('</table>');
    });

    it('should convert images to figures', () => {
      const markdown = '![Alt text](https://example.com/image.png)';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('<figure>');
      expect(result).toContain('<img src="https://example.com/image.png"');
      expect(result).toContain('alt="Alt text"');
      expect(result).toContain('<figcaption>Alt text</figcaption>');
    });

    it('should convert video URLs to video elements', () => {
      const markdown = '![Video](https://example.com/video.mp4)';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('<figure>');
      expect(result).toContain('<video controls>');
      expect(result).toContain('<source src="https://example.com/video.mp4"');
      expect(result).toContain('type="video/mp4"');
      expect(result).toContain('<figcaption>Video</figcaption>');
    });

    it('should handle webm video format', () => {
      const markdown = '![Video](https://example.com/video.webm)';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('type="video/webm"');
    });

    it('should handle mov video format', () => {
      const markdown = '![Video](https://example.com/video.mov)';
      const result = convertMarkdownToHtmlBody(markdown);

      expect(result).toContain('type="video/quicktime"');
    });
  });

  describe('convertMarkdownToHtml', () => {
    it('should generate complete HTML document', () => {
      const markdown = '# Test Report\n\nThis is content.';
      const title = 'Test Report';
      const result = convertMarkdownToHtml(markdown, title);

      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<html lang="ja">');
      expect(result).toContain('<head>');
      expect(result).toContain('<title>Test Report</title>');
      expect(result).toContain('<style>');
      expect(result).toContain('</head>');
      expect(result).toContain('<body>');
      expect(result).toContain('<h1>Test Report</h1>');
      expect(result).toContain('<p>This is content.</p>');
      expect(result).toContain('</body>');
      expect(result).toContain('</html>');
    });

    it('should escape HTML in title', () => {
      const markdown = '# Test';
      const title = '<script>alert("xss")</script>';
      const result = convertMarkdownToHtml(markdown, title);

      expect(result).toContain('&lt;script&gt;');
      expect(result).not.toContain('<script>alert');
    });

    it('should include CSS variables', () => {
      const markdown = '# Test';
      const result = convertMarkdownToHtml(markdown, 'Test');

      expect(result).toContain('--gray-50');
      expect(result).toContain('--gray-900');
      expect(result).toContain('--blue-600');
    });

    it('should include responsive styles', () => {
      const markdown = '# Test';
      const result = convertMarkdownToHtml(markdown, 'Test');

      expect(result).toContain('@media (max-width: 640px)');
      expect(result).toContain('@media print');
    });

    it('should include KaTeX CDN for LaTeX math rendering', () => {
      const markdown = '# Math Test';
      const result = convertMarkdownToHtml(markdown, 'Math Test');

      expect(result).toContain('katex.min.css');
      expect(result).toContain('katex.min.js');
      expect(result).toContain('auto-render.min.js');
      expect(result).toContain('renderMathInElement');
    });

    it('should include Mermaid CDN for diagram rendering', () => {
      const markdown = '# Diagram Test';
      const result = convertMarkdownToHtml(markdown, 'Diagram Test');

      expect(result).toContain('mermaid');
      expect(result).toContain('mermaid.initialize');
    });
  });

  describe('Complex markdown documents', () => {
    it('should handle a complete report', () => {
      const markdown = `# 調査レポート

## 概要

このレポートは**重要な**調査結果をまとめたものです。

## データ

| 項目 | 値 | 状態 |
| --- | --- | --- |
| A | 100 | ✓ |
| B | 200 | ✗ |

## タスク

- [x] データ収集
- [x] 分析完了
- [ ] レビュー待ち

## コード例

\`\`\`typescript
const result = await analyze(data);
console.log(result);
\`\`\`

> 注意: このデータは暫定値です。

---

詳細は[こちら](https://example.com)をご覧ください。

![グラフ](https://example.com/chart.png)`;

      const result = convertMarkdownToHtml(markdown, '調査レポート');

      // Document structure
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<title>調査レポート</title>');

      // Headings
      expect(result).toContain('<h1>調査レポート</h1>');
      expect(result).toContain('<h2>概要</h2>');
      expect(result).toContain('<h2>データ</h2>');

      // Formatting
      expect(result).toContain('<strong>重要な</strong>');

      // Table
      expect(result).toContain('<table>');
      expect(result).toContain('<th>項目</th>');
      expect(result).toContain('<td>100</td>');

      // Task list
      expect(result).toContain('class="task-list"');
      expect(result).toContain('checked>');

      // Code block
      expect(result).toContain('<pre>');
      expect(result).toContain('const result');

      // Blockquote
      expect(result).toContain('<blockquote>');

      // Link
      expect(result).toContain('<a href="https://example.com">こちら</a>');

      // Image
      expect(result).toContain('<figure>');
      expect(result).toContain('<img src="https://example.com/chart.png"');
    });
  });
});
