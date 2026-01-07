import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Loader2, Paperclip } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { StoragePathDisplay } from './StoragePathDisplay';
import { StorageManagementModal } from './StorageManagementModal';
import { ModelSelector } from './ui/ModelSelector';
import { ImagePreview } from './ImagePreview';
import type { ImageAttachment } from '../types/index';
import { IMAGE_ATTACHMENT_CONFIG } from '../types/index';

interface MessageInputProps {
  sessionId: string | null;
  onCreateSession: () => string;
  getScenarioPrompt?: () => string | null;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  sessionId,
  onCreateSession,
  getScenarioPrompt,
}) => {
  const { t } = useTranslation();
  const { sendPrompt, isLoading } = useChatStore();
  const { sendBehavior } = useSettingsStore();
  const [input, setInput] = useState('');
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([]);
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevLoadingRef = useRef(isLoading);

  // テキストエリアの自動リサイズ
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  // ローディング完了時にフォーカスを戻す
  useEffect(() => {
    // ローディングが完了した時（true → false）にフォーカスを戻す
    if (prevLoadingRef.current && !isLoading) {
      textareaRef.current?.focus();
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading]);

  // 画像ファイルのバリデーション
  const validateImageFile = useCallback(
    (file: File): string | null => {
      if (!IMAGE_ATTACHMENT_CONFIG.ACCEPTED_TYPES.includes(file.type as never)) {
        return t('chat.imageAttachment.invalidType');
      }
      if (file.size >= IMAGE_ATTACHMENT_CONFIG.MAX_FILE_SIZE) {
        return t('chat.imageAttachment.tooLarge');
      }
      return null;
    },
    [t]
  );

  // 画像ファイルを処理して添付
  const processAndAttachImages = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const remainingSlots = IMAGE_ATTACHMENT_CONFIG.MAX_COUNT - attachedImages.length;

      if (remainingSlots <= 0) {
        alert(t('chat.imageAttachment.maxReached'));
        return;
      }

      const filesToProcess = fileArray.slice(0, remainingSlots);
      const newImages: ImageAttachment[] = [];

      for (const file of filesToProcess) {
        const error = validateImageFile(file);
        if (error) {
          alert(`${file.name}: ${error}`);
          continue;
        }

        const previewUrl = URL.createObjectURL(file);
        newImages.push({
          id: nanoid(),
          file,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          previewUrl,
        });
      }

      if (newImages.length > 0) {
        setAttachedImages((prev) => [...prev, ...newImages]);
      }
    },
    [attachedImages.length, validateImageFile, t]
  );

  // 画像の削除
  const handleRemoveImage = useCallback((id: string) => {
    setAttachedImages((prev) => {
      const imageToRemove = prev.find((img) => img.id === id);
      if (imageToRemove?.previewUrl) {
        URL.revokeObjectURL(imageToRemove.previewUrl);
      }
      return prev.filter((img) => img.id !== id);
    });
  }, []);

  // ファイル入力の変更ハンドラ
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processAndAttachImages(e.target.files);
        e.target.value = '';
      }
    },
    [processAndAttachImages]
  );

  // ドラッグ＆ドロップハンドラ
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const imageFiles = Array.from(files).filter((file) =>
          IMAGE_ATTACHMENT_CONFIG.ACCEPTED_TYPES.includes(file.type as never)
        );
        if (imageFiles.length > 0) {
          processAndAttachImages(imageFiles);
        }
      }
    },
    [processAndAttachImages]
  );

  // クリーンアップ: コンポーネントアンマウント時にObject URLを解放
  useEffect(() => {
    return () => {
      attachedImages.forEach((img) => {
        if (img.previewUrl) {
          URL.revokeObjectURL(img.previewUrl);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // シナリオプロンプトの自動入力
  useEffect(() => {
    if (getScenarioPrompt) {
      const scenarioPrompt = getScenarioPrompt();
      if (scenarioPrompt) {
        // 次のフレームで実行してカスケードレンダリングを防ぐ
        requestAnimationFrame(() => {
          setInput(scenarioPrompt);
          // フォーカスを当ててカーソルを末尾に移動
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
              textareaRef.current.setSelectionRange(scenarioPrompt.length, scenarioPrompt.length);
            }
          }, 0);
        });
      }
    }
  }, [getScenarioPrompt]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // エラーがある場合のみクリア（不要な再レンダリングを防ぐ）
    // エラーは送信時または新しいメッセージ受信時にクリアされるため、ここでは削除
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const hasContent = input.trim() || attachedImages.length > 0;
    if (!hasContent || isLoading) {
      return;
    }

    try {
      // 送信するメッセージを保存
      const messageToSend = input.trim();
      const imagesToSend = [...attachedImages];

      // 入力フィールドを即座にクリア
      setInput('');
      setAttachedImages([]);

      // 送信後にテキストエリアにフォーカスを戻す
      textareaRef.current?.focus();

      // 新規セッションの場合は先にセッション作成
      let targetSessionId = sessionId;
      if (!targetSessionId) {
        targetSessionId = onCreateSession();
      }

      // メッセージ送信（非同期で継続）
      await sendPrompt(messageToSend, targetSessionId, imagesToSend);

      // 送信完了後にObject URLを解放
      imagesToSend.forEach((img) => {
        if (img.previewUrl) {
          URL.revokeObjectURL(img.previewUrl);
        }
      });
    } catch (err) {
      console.error('メッセージ送信エラー:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // IME変換中は何もしない
    if (e.nativeEvent.isComposing) {
      return;
    }

    if (sendBehavior === 'enter') {
      // Enter で送信、Shift+Enter で改行
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    } else {
      // Cmd/Ctrl+Enter で送信、Enter で改行
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit(e);
      }
    }
  };

  return (
    <div
      className="sticky bottom-0 left-0 right-0 z-30 bg-white p-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      {/* ストレージパス表示 */}
      <div className="max-w-4xl mx-auto mb-2">
        <StoragePathDisplay onClick={() => setIsStorageModalOpen(true)} />
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        <div
          className={`relative ${isDragging ? 'ring-2 ring-blue-400 ring-opacity-50 rounded-2xl' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* 添付画像プレビュー */}
          <ImagePreview images={attachedImages} onRemove={handleRemoveImage} disabled={isLoading} />

          {/* 隠しファイル入力 */}
          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_ATTACHMENT_CONFIG.ACCEPTED_TYPES.join(',')}
            multiple
            onChange={handleFileChange}
            className="hidden"
          />

          {/* テキスト入力エリア - 2行分のスペースを確保 */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.messageInputPlaceholder')}
            className="w-full px-4 py-3 pr-12 pb-12 border border-gray-200 rounded-2xl focus:outline-none focus:ring-1 focus:ring-gray-200 focus:border-transparent resize-none min-h-[72px] max-h-[200px] bg-white"
            rows={2}
            style={{ height: 'auto' }}
          />

          {/* モデルセレクター - 下部に配置 */}
          <div className="absolute bottom-3 left-1.5 flex items-center gap-1">
            <ModelSelector />
            {/* 画像添付ボタン */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || attachedImages.length >= IMAGE_ATTACHMENT_CONFIG.MAX_COUNT}
              className={`p-1.5 rounded-md transition-colors ${
                isLoading || attachedImages.length >= IMAGE_ATTACHMENT_CONFIG.MAX_COUNT
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
              title={t('chat.imageAttachment.attach')}
            >
              <Paperclip className="w-4 h-4" />
            </button>
          </div>

          {/* 送信ボタン */}
          <button
            type="submit"
            disabled={(!input.trim() && attachedImages.length === 0) || isLoading}
            className={`absolute right-2 bottom-2 w-8 h-8 rounded-md flex items-center justify-center transition-all duration-200 ${
              (!input.trim() && attachedImages.length === 0) || isLoading
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-black hover:bg-gray-100'
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </form>

      {/* ストレージ管理モーダル */}
      <StorageManagementModal
        isOpen={isStorageModalOpen}
        onClose={() => setIsStorageModalOpen(false)}
      />
    </div>
  );
};
