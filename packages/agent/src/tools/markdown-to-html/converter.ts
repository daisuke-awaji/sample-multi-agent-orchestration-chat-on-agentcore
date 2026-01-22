/**
 * Markdown to HTML converter using marked library
 */

import { marked, Renderer, type Tokens } from 'marked';
import { generateHtmlDocument } from './template.js';

// Video file extensions
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];

/**
 * Check if URL points to a video file
 */
function isVideoUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lowerUrl.endsWith(ext));
}

/**
 * Parse list item tokens to HTML
 */
function parseListItemContent(item: Tokens.ListItem): string {
  if (item.tokens && item.tokens.length > 0) {
    return marked.parser(item.tokens);
  }
  return item.text;
}

/**
 * Custom renderer for marked
 */
function createCustomRenderer(): Renderer {
  const renderer = new Renderer();

  // Override image rendering to support videos and figures
  renderer.image = ({ href, title, text }: Tokens.Image): string => {
    if (isVideoUrl(href)) {
      // Render as video
      const titleAttr = title ? ` title="${title}"` : '';
      const caption = text ? `<figcaption>${text}</figcaption>` : '';
      return `<figure>
  <video controls${titleAttr}>
    <source src="${href}" type="video/${getVideoType(href)}">
    Your browser does not support the video tag.
  </video>
  ${caption}
</figure>`;
    }

    // Render as image with figure
    const titleAttr = title ? ` title="${title}"` : '';
    const caption = text ? `<figcaption>${text}</figcaption>` : '';
    return `<figure>
  <img src="${href}" alt="${text || ''}"${titleAttr}>
  ${caption}
</figure>`;
  };

  // Override list rendering to support task lists and parse inline content
  renderer.list = ({ items, ordered, start }: Tokens.List): string => {
    const hasTaskItems = items.some((item) => item.task);
    const tag = ordered ? 'ol' : 'ul';
    const startAttr = ordered && start !== 1 ? ` start="${start}"` : '';
    const classAttr = hasTaskItems ? ' class="task-list"' : '';

    const body = items
      .map((item) => {
        const content = parseListItemContent(item).trim();
        if (item.task) {
          const checked = item.checked ? ' checked' : '';
          const checkbox = `<input type="checkbox" disabled${checked}>`;
          return `<li>${checkbox}${content}</li>`;
        }
        return `<li>${content}</li>`;
      })
      .join('\n');

    return `<${tag}${startAttr}${classAttr}>\n${body}\n</${tag}>`;
  };

  // Override code block rendering to support Mermaid diagrams
  renderer.code = ({ text, lang }: Tokens.Code): string => {
    if (lang === 'mermaid') {
      return `<pre class="mermaid">\n${text}\n</pre>`;
    }
    const langClass = lang ? ` class="language-${lang}"` : '';
    const escapedText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre><code${langClass}>${escapedText}</code></pre>`;
  };

  return renderer;
}

/**
 * Get video MIME type from extension
 */
function getVideoType(url: string): string {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.endsWith('.webm')) return 'webm';
  if (lowerUrl.endsWith('.mov')) return 'quicktime';
  if (lowerUrl.endsWith('.avi')) return 'x-msvideo';
  if (lowerUrl.endsWith('.mkv')) return 'x-matroska';
  if (lowerUrl.endsWith('.m4v')) return 'x-m4v';
  return 'mp4'; // default
}

/**
 * Configure marked options
 */
function configureMarked(): void {
  marked.setOptions({
    gfm: true,
    breaks: false,
    renderer: createCustomRenderer(),
  });
}

/**
 * Convert Markdown content to HTML body
 */
export function convertMarkdownToHtmlBody(markdown: string): string {
  configureMarked();
  return marked.parse(markdown) as string;
}

/**
 * Convert Markdown content to complete HTML document
 */
export function convertMarkdownToHtml(markdown: string, title: string): string {
  const bodyContent = convertMarkdownToHtmlBody(markdown);
  return generateHtmlDocument(title, bodyContent);
}
