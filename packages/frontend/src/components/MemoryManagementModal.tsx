/**
 * メモリ管理モーダル
 * 保存されたメモリレコードの一覧・検索・削除機能を提供
 */

import { useState, useEffect } from 'react';
import { X, Search, Trash2, Brain, AlertCircle, Loader2 } from 'lucide-react';
import { useMemoryStore } from '../stores/memoryStore';
import { type MemoryRecord } from '../api/memory';
import { Modal } from './ui/Modal/Modal';

interface MemoryManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * メモリレコード表示コンポーネント
 */
interface MemoryRecordItemProps {
  record: MemoryRecord;
  onDelete: (recordId: string) => void;
  isDeleting: boolean;
}

function MemoryRecordItem({ record, onDelete, isDeleting }: MemoryRecordItemProps) {
  const handleDelete = () => {
    if (window.confirm('このメモリを削除しますか？')) {
      onDelete(record.recordId);
    }
  };

  // コンテンツを100文字に制限
  const truncatedContent =
    record.content.length > 100 ? record.content.slice(0, 100) + '...' : record.content;

  // recordIdが空の場合は削除ボタンを無効化
  const canDelete = Boolean(record.recordId && record.recordId.trim());

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-900 leading-relaxed mb-2">{truncatedContent}</p>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>作成: {new Date(record.createdAt).toLocaleDateString('ja-JP')}</span>
            <span>更新: {new Date(record.updatedAt).toLocaleDateString('ja-JP')}</span>
            {!canDelete && <span className="text-red-500">削除不可（IDが無効）</span>}
          </div>
        </div>
        <button
          onClick={handleDelete}
          disabled={isDeleting || !canDelete}
          className="flex-shrink-0 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={canDelete ? '削除' : '削除不可（レコードIDが無効）'}
        >
          {isDeleting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * メモリ管理モーダル
 */
export function MemoryManagementModal({ isOpen, onClose }: MemoryManagementModalProps) {
  const {
    records,
    isLoading,
    isDeleting,
    error,
    loadMemoryRecords,
    deleteMemoryRecord,
    searchMemoryRecords,
    clearError,
  } = useMemoryStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemoryRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // モーダル表示時にデータを読み込み
  useEffect(() => {
    if (isOpen) {
      loadMemoryRecords();
    }
  }, [isOpen, loadMemoryRecords]);

  // 検索実行
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchMemoryRecords(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Enterキーでの検索
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // 検索クリア
  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
  };

  // 削除処理
  const handleDelete = (recordId: string) => {
    deleteMemoryRecord(recordId);
  };

  // 表示するレコード（検索中は検索結果、通常時は全レコード）
  const displayRecords = searchQuery ? searchResults : records;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" className="max-w-4xl">
      {/* ヘッダー */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900">保存されたメモリ</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          エージェントは最近のチャットを記憶しようとしますが、時間の経過と共に忘れることもあります。
          保存されたメモリは決して忘れられることはありません。
        </p>
      </div>

      {/* 検索セクション */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="メモリを検索"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching || !searchQuery.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : '検索'}
          </button>
        </div>
      </div>

      {/* コンテンツエリア */}
      <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
        {/* エラー表示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-red-800">{error}</p>
              <button
                onClick={clearError}
                className="text-sm text-red-600 hover:text-red-800 font-medium mt-1"
              >
                閉じる
              </button>
            </div>
          </div>
        )}

        {/* ローディング */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-600">読み込み中...</span>
          </div>
        )}

        {/* メモリレコード一覧 */}
        {!isLoading && (
          <>
            {searchQuery && (
              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  検索結果: "{searchQuery}" ({searchResults.length}件)
                </p>
              </div>
            )}

            {displayRecords.length === 0 ? (
              <div className="text-center py-8">
                <Brain className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-sm text-gray-600 mb-2">
                  {searchQuery
                    ? '検索結果が見つかりませんでした'
                    : records.length === 0
                      ? 'まだメモリが保存されていません'
                      : 'メモリがありません'}
                </p>
                {!searchQuery && records.length === 0 && (
                  <p className="text-xs text-gray-500">
                    エージェントとの会話を続けると、自動的にメモリが蓄積されます
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {displayRecords.map((record, index) => (
                  <MemoryRecordItem
                    key={record.recordId || `memory-${index}`}
                    record={record}
                    onDelete={handleDelete}
                    isDeleting={isDeleting === record.recordId}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* フッター */}
      <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
        <div className="flex justify-between items-center">
          <p className="text-xs text-gray-500">
            合計 {records.length} 件のメモリが保存されています
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </Modal>
  );
}
