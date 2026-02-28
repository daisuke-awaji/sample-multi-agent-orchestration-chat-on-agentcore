import React from 'react';
import { Renderer, JSONUIProvider } from '@json-render/react';
import type { Spec } from '@json-render/core';
import { registry } from './moca-catalog';

interface JsonRenderBlockProps {
  content: string;
}

/**
 * Extract the raw UI spec JSON string from various content formats:
 * - Direct JSON string: '{"__moca_ui_spec":true,"spec":{...}}'
 * - textBlock array (from session history API): '[{"type":"textBlock","text":"{...}"}]'
 */
function extractSpecContent(content: string): string {
  try {
    const parsed = JSON.parse(content);

    // If it's already an object with __moca_ui_spec or root+elements, return as-is
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return content;
    }

    // If it's an array (textBlock format from session history), unwrap
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item === 'object') {
          const text = item.text || item.resource?.text;
          if (typeof text === 'string') {
            // Recursively unwrap in case of nested wrapping
            const inner = extractSpecContent(text);
            try {
              const innerParsed = JSON.parse(inner);
              if (
                innerParsed &&
                typeof innerParsed === 'object' &&
                (innerParsed.__moca_ui_spec || (innerParsed.root && innerParsed.elements))
              ) {
                return inner;
              }
            } catch {
              // not valid JSON, continue
            }
          }
        }
      }
    }
  } catch {
    // not valid JSON, return as-is
  }
  return content;
}

export const JsonRenderBlock: React.FC<JsonRenderBlockProps> = ({ content }) => {
  const spec = React.useMemo<Spec | null>(() => {
    try {
      const normalizedContent = extractSpecContent(content);
      const parsed = JSON.parse(normalizedContent);
      if (parsed.__moca_ui_spec && parsed.spec) {
        return parsed.spec as Spec;
      }
      if (parsed.root && parsed.elements) {
        return parsed as Spec;
      }
      return null;
    } catch {
      return null;
    }
  }, [content]);

  if (!spec) {
    return (
      <pre className="text-xs bg-surface-secondary rounded p-3 overflow-x-auto whitespace-pre-wrap break-words">
        {content}
      </pre>
    );
  }

  return (
    <div className="moca-ui-render p-3">
      <JSONUIProvider registry={registry}>
        <Renderer spec={spec} registry={registry} />
      </JSONUIProvider>
    </div>
  );
};
