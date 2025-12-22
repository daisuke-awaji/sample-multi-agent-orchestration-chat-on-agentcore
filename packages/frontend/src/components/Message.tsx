import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Message as MessageType } from '../types/index';
import { TypingIndicator } from './TypingIndicator';
import { ToolUseBlock } from './ToolUseBlock';
import { ToolResultBlock } from './ToolResultBlock';
import { MermaidDiagram } from './MermaidDiagram';

interface MessageProps {
  message: MessageType;
}

export const Message: React.FC<MessageProps> = ({ message }) => {
  const isUser = message.type === 'user';

  // toolUse/toolResult を含むメッセージかどうか判定
  const hasToolContent = message.contents.some(
    (content) => content.type === 'toolUse' || content.type === 'toolResult'
  );

  // Markdownカスタムコンポーネント

  const markdownComponents = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    code: ({ inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';

      if (!inline && match) {
        // Mermaid図の場合
        if (language === 'mermaid') {
          return <MermaidDiagram chart={String(children).replace(/\n$/, '')} />;
        }

        // その他のコードブロック
        return (
          <SyntaxHighlighter
            style={oneLight}
            language={language}
            PreTag="div"
            className="rounded-lg"
            {...props}
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        );
      }

      // インラインコード
      return (
        <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-sm" {...props}>
          {children}
        </code>
      );
    },
    // テーブルのスタイル調整
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    table: ({ children, ...props }: any) => (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full border-collapse border border-gray-300" {...props}>
          {children}
        </table>
      </div>
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    th: ({ children, ...props }: any) => (
      <th
        className="border border-gray-300 px-4 py-2 bg-gray-50 font-semibold text-left"
        {...props}
      >
        {children}
      </th>
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    td: ({ children, ...props }: any) => (
      <td className="border border-gray-300 px-4 py-2" {...props}>
        {children}
      </td>
    ),
    // 引用のスタイル
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    blockquote: ({ children, ...props }: any) => (
      <blockquote
        className="border-l-4 border-gray-300 pl-4 py-2 my-4 bg-gray-50 italic"
        {...props}
      >
        {children}
      </blockquote>
    ),
  };

  return (
    <div
      className={`flex mb-6 ${hasToolContent ? 'justify-start' : isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`flex flex-row items-start w-full ${
          hasToolContent ? 'max-w-full' : isUser ? 'max-w-3xl ml-auto' : 'max-w-4xl'
        }`}
      >
        {/* メッセージバブル */}
        <div
          className={`relative ${
            hasToolContent
              ? 'w-full'
              : isUser
                ? 'message-bubble message-user'
                : 'message-bubble message-assistant'
          } ${message.isStreaming ? 'bg-opacity-90' : ''}`}
        >
          {/* メッセージ内容 */}
          <div className="prose prose-sm max-w-none">
            {message.contents.length > 0 || !message.isStreaming ? (
              <div className="message-contents space-y-2">
                {message.contents.map((content, index) => {
                  switch (content.type) {
                    case 'text':
                      return (
                        <div key={`text-${index}`} className="markdown-content">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={markdownComponents}
                          >
                            {content.text || ''}
                          </ReactMarkdown>
                        </div>
                      );

                    case 'toolUse':
                      return content.toolUse ? (
                        <ToolUseBlock key={`tool-use-${index}`} toolUse={content.toolUse} />
                      ) : null;

                    case 'toolResult':
                      return content.toolResult ? (
                        <ToolResultBlock
                          key={`tool-result-${index}`}
                          toolResult={content.toolResult}
                        />
                      ) : null;

                    default:
                      return (
                        <div key={`unknown-${index}`} className="text-gray-500 text-sm">
                          未対応のコンテンツタイプ: {content.type}
                        </div>
                      );
                  }
                })}

                {/* コンテンツが空でストリーミング中の場合 */}
                {message.contents.length === 0 && message.isStreaming && <TypingIndicator />}
              </div>
            ) : (
              <TypingIndicator />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
