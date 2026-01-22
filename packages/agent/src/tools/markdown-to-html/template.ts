/**
 * HTML template with embedded CSS for Markdown to HTML conversion
 * Follows the app's design system: white/black/gray color palette
 */

export const CSS_STYLES = `
:root {
  --gray-50: #f9fafb;
  --gray-100: #f3f4f6;
  --gray-200: #e5e7eb;
  --gray-300: #d1d5db;
  --gray-400: #9ca3af;
  --gray-500: #6b7280;
  --gray-600: #4b5563;
  --gray-700: #374151;
  --gray-800: #1f2937;
  --gray-900: #111827;
  --blue-600: #2563eb;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: "M PLUS Rounded 1c", ui-rounded, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 16px;
  line-height: 1.7;
  color: var(--gray-800);
  background-color: #fff;
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

/* Headings */
h1, h2, h3, h4, h5, h6 {
  color: var(--gray-900);
  font-weight: 600;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
  line-height: 1.3;
}

h1 {
  font-size: 1.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--gray-200);
}

h2 {
  font-size: 1.25rem;
}

h3 {
  font-size: 1.125rem;
}

h4, h5, h6 {
  font-size: 1rem;
}

/* Paragraphs */
p {
  margin-bottom: 1rem;
}

/* Links */
a {
  color: var(--blue-600);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

/* Strong and emphasis */
strong {
  font-weight: 600;
  color: var(--gray-900);
}

em {
  font-style: italic;
}

del {
  color: var(--gray-500);
}

/* Lists */
ul, ol {
  margin-bottom: 1rem;
  padding-left: 1.5rem;
}

li {
  margin-bottom: 0.25rem;
}

li > ul, li > ol {
  margin-top: 0.25rem;
  margin-bottom: 0;
}

/* Task lists */
ul.task-list {
  list-style: none;
  padding-left: 0;
}

ul.task-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

ul.task-list input[type="checkbox"] {
  margin-top: 0.35rem;
  accent-color: var(--gray-600);
}

/* Blockquotes */
blockquote {
  margin: 1rem 0;
  padding: 0.75rem 1rem;
  border-left: 4px solid var(--gray-300);
  background-color: var(--gray-50);
  color: var(--gray-600);
}

blockquote p:last-child {
  margin-bottom: 0;
}

/* Code */
code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.875em;
  background-color: var(--gray-100);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  color: var(--gray-800);
}

pre {
  margin: 1rem 0;
  padding: 1rem;
  background-color: var(--gray-100);
  border-radius: 8px;
  overflow-x: auto;
}

pre code {
  background: none;
  padding: 0;
  font-size: 0.875rem;
  line-height: 1.5;
}

/* Tables */
table {
  width: 100%;
  margin: 1rem 0;
  border-collapse: collapse;
  font-size: 0.9rem;
}

th, td {
  padding: 0.75rem;
  text-align: left;
  border: 1px solid var(--gray-200);
}

th {
  background-color: var(--gray-50);
  font-weight: 600;
  color: var(--gray-900);
}

tr:hover {
  background-color: var(--gray-50);
}

/* Horizontal rule */
hr {
  margin: 2rem 0;
  border: none;
  border-top: 1px solid var(--gray-300);
}

/* Images and figures */
figure {
  margin: 1.5rem 0;
}

img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

figcaption {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: var(--gray-500);
  text-align: center;
}

/* Videos */
video {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

/* Mermaid diagrams */
pre.mermaid {
  background: none;
  padding: 0;
  text-align: center;
}

/* Responsive */
@media (max-width: 640px) {
  body {
    padding: 1rem 0.75rem;
  }
  
  h1 {
    font-size: 1.25rem;
  }
  
  h2 {
    font-size: 1.125rem;
  }
  
  table {
    font-size: 0.8rem;
  }
  
  th, td {
    padding: 0.5rem;
  }
}

/* Print styles */
@media print {
  body {
    max-width: none;
    padding: 0;
  }
  
  pre {
    white-space: pre-wrap;
    word-wrap: break-word;
  }
}
`;

/**
 * Generate complete HTML document
 */
export function generateHtmlDocument(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${CSS_STYLES}</style>
  <!-- KaTeX for LaTeX math rendering -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" integrity="sha384-n8MVd4RsNIU0tAv4ct0nTaAbDJwPJzDEaqSD1odI+WdtXRGWt2kTvGFasHpSy3SV" crossorigin="anonymous">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js" integrity="sha384-XjKyOOlGwcjNTAIQHIpgOno0Ber8A78D7Y6q4L9lAMh8Bqgq0f1LQOAkA0Z0xQp7" crossorigin="anonymous"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js" integrity="sha384-+VBxd3r6XgURycqtZ117nYw44OOcIax56Z4dCRWbxyPt0Koah1uHoK0o4+/RRE05" crossorigin="anonymous"></script>
  <script>
    document.addEventListener("DOMContentLoaded", function() {
      renderMathInElement(document.body, {
        delimiters: [
          {left: '$', right: '$', display: true},
          {left: '
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
, right: '
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
, display: false}
        ],
        throwOnError: false
      });
    });
  </script>
  <!-- Mermaid for diagram rendering -->
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: true, theme: 'neutral' });
  </script>
</head>
<body>
${bodyContent}
</body>
</html>`;
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
