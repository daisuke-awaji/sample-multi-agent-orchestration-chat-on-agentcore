import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Message as MessageType } from '../types/index';

interface MessageProps {
  message: MessageType;
}

export const Message: React.FC<MessageProps> = ({ message }) => {
  const isUser = message.type === 'user';

  // Markdownカスタムコンポーネント

  const markdownComponents = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    code: ({ inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <SyntaxHighlighter
          style={oneLight}
          language={match[1]}
          PreTag="div"
          className="rounded-lg"
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
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
    <div className={`flex mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`flex flex-row items-start w-full ${isUser ? 'max-w-3xl ml-auto' : 'max-w-4xl'}`}
      >
        {/* メッセージバブル */}
        <div
          className={`relative ${
            isUser ? 'message-bubble message-user' : 'message-bubble message-assistant'
          } ${message.isStreaming ? 'bg-opacity-90' : ''}`}
        >
          {/* メッセージ内容 */}
          <div className="prose prose-sm max-w-none">
            {message.content ? (
              <div className="markdown-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {message.content}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="text-gray-500 italic">
                {message.isStreaming ? 'Thinking...' : 'メッセージがありません'}
              </div>
            )}
          </div>

          {/* ストリーミングインジケーター */}
          {message.isStreaming && (
            <div className="flex items-center text-gray-500">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0.1s' }}
                ></div>
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0.2s' }}
                ></div>
              </div>
              <span className="ml-2 text-xs">生成中...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
