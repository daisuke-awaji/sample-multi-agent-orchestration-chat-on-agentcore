import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import type { Message as MessageType } from '../types/index';
import { TypingIndicator } from './TypingIndicator';
import { ToolUseBlock } from './ToolUseBlock';
import { ToolResultBlock } from './ToolResultBlock';
import { MermaidDiagram } from './MermaidDiagram';
import { S3FileLink } from './S3FileLink';
import { S3Image } from './S3Image';
import { S3Video } from './S3Video';

interface MessageProps {
  message: MessageType;
}

export const Message: React.FC<MessageProps> = ({ message }) => {
  const { t } = useTranslation();
  const isUser = message.type === 'user';

  // toolUse/toolResult を含むメッセージかどうか判定
  const hasToolContent = message.contents.some(
    (content) => content.type === 'toolUse' || content.type === 'toolResult'
  );

  // Check if a path is an S3 storage path (user relative path)
  const isStoragePath = (href: string): boolean => {
    return href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/api/');
  };

  // Check if a path is a video file
  const isVideoFile = (path: string): boolean => {
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
    const lowerPath = path.toLowerCase();
    return videoExtensions.some((ext) => lowerPath.endsWith(ext));
  };

  // Markdownカスタムコンポーネント（メモ化で参照を安定させる）
  const markdownComponents = useMemo(
    () => ({
      // Custom link renderer for S3 files
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      a: ({ href, children, ...props }: any) => {
        if (href && isStoragePath(href)) {
          // Check if it's a video file and display inline
          if (isVideoFile(href)) {
            return (
              <div className="my-4">
                <S3Video path={href} className="max-w-full" />
              </div>
            );
          }
          return <S3FileLink path={href}>{children}</S3FileLink>;
        }
        // Regular link
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
            {children}
          </a>
        );
      },
      // Custom image renderer for S3 images and videos
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      img: ({ src, alt, ...props }: any) => {
        if (src && isStoragePath(src)) {
          // Check if it's a video file and display inline
          if (isVideoFile(src)) {
            return (
              <div className="my-4">
                <S3Video path={src} className="max-w-full" />
              </div>
            );
          }
          return <S3Image path={src} alt={alt || ''} className="max-w-full rounded-lg" />;
        }
        // Regular image
        return <img src={src} alt={alt} {...props} />;
      },
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
      // 段落: ブロック要素（動画など）が含まれる場合はdivを使用
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      p: ({ children, ...props }: any) => {
        // Check if any child contains a div (which happens when S3Video is rendered)
        const childArray = React.Children.toArray(children);
        const hasBlockElement = childArray.some((child) => {
          if (React.isValidElement(child)) {
            // Check if the element has a div in its structure
            const elementType = child.type;
            // S3Video and S3Image components return div elements
            if (typeof elementType === 'function') {
              // This is a component, we assume it might contain block elements
              return true;
            }
          }
          return false;
        });

        // If there's a block element, use div instead of p to avoid nesting errors
        if (hasBlockElement) {
          return <div {...props}>{children}</div>;
        }

        return <p {...props}>{children}</p>;
      },
    }),
    []
  ); // 依存配列を空にして、コンポーネントの生存期間中は同じ参照を保持

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
          {/* エラーアイコン表示 */}
          {message.isError && (
            <div className="flex items-center gap-2 mb-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-sm font-medium">{t('common.errorOccurred')}</span>
            </div>
          )}

          {/* メッセージ内容 */}
          <div className="prose prose-sm max-w-none">
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
                        {t('common.unsupportedContentType', { type: content.type })}
                      </div>
                    );
                }
              })}

              {/* ストリーミング中で、次のコンテンツを待っている状態でTypingIndicatorを表示 */}
              {message.isStreaming &&
                (message.contents.length === 0 ||
                  message.contents[message.contents.length - 1]?.type === 'toolResult') && (
                  <TypingIndicator />
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
