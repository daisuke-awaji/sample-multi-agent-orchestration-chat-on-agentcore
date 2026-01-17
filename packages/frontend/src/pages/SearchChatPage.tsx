/**
 * Chat Search Page
 * Search and filter past conversation sessions
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingIndicator } from '../components/ui/LoadingIndicator';
import { ConfirmModal } from '../components/ui/Modal';
import { useSessionStore } from '../stores/sessionStore';

/**
 * Search Chat Page Main Component
 */
export function SearchChatPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    sessions,
    isLoadingSessions,
    isLoadingMoreSessions,
    loadAllSessions,
    deleteMultipleSessions,
  } = useSessionStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selection state
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Load all sessions on mount
  useEffect(() => {
    // Load all sessions for comprehensive search
    loadAllSessions();
  }, [loadAllSessions]);

  // Check if still loading sessions
  const isLoading = isLoadingSessions || isLoadingMoreSessions;

  // Filter sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      // Title filter
      if (searchQuery && !session.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      // Date range filter
      const sessionDate = new Date(session.updatedAt);
      if (startDate && sessionDate < new Date(startDate)) {
        return false;
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        if (sessionDate > endDateTime) {
          return false;
        }
      }

      return true;
    });
  }, [sessions, searchQuery, startDate, endDate]);

  // Check if all filtered sessions are selected
  const allFilteredSelected =
    filteredSessions.length > 0 &&
    filteredSessions.every((s) => selectedSessionIds.has(s.sessionId));

  // Toggle single session selection
  const toggleSelection = useCallback((sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedSessionIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });
  }, []);

  // Toggle select all filtered sessions
  const toggleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      // Deselect all filtered sessions
      setSelectedSessionIds((prev) => {
        const newSet = new Set(prev);
        filteredSessions.forEach((s) => newSet.delete(s.sessionId));
        return newSet;
      });
    } else {
      // Select all filtered sessions
      setSelectedSessionIds((prev) => {
        const newSet = new Set(prev);
        filteredSessions.forEach((s) => newSet.add(s.sessionId));
        return newSet;
      });
    }
  }, [allFilteredSelected, filteredSessions]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedSessionIds(new Set());
  }, []);

  // Handle bulk delete
  const handleBulkDelete = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  // Confirm bulk delete
  const confirmBulkDelete = useCallback(() => {
    const idsToDelete = Array.from(selectedSessionIds);
    setShowDeleteConfirm(false);
    setSelectedSessionIds(new Set());
    deleteMultipleSessions(idsToDelete);
  }, [selectedSessionIds, deleteMultipleSessions]);

  const handleSessionClick = (sessionId: string) => {
    navigate(`/chat/${sessionId}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const selectedCount = selectedSessionIds.size;

  return (
    <>
      <PageHeader icon={Search} title={t('navigation.searchChat')} />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Search and Filter Section */}
          <div className="mb-6 space-y-4">
            {/* Search Input */}
            <div>
              <input
                type="text"
                placeholder={t('chat.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">{t('chat.searchNote')}</p>
            </div>

            {/* Date Range Filter */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 whitespace-nowrap">
                {t('chat.searchDateRange')}:
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t('chat.searchDateStart')}
              />
              <span className="text-gray-400">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t('chat.searchDateEnd')}
              />
            </div>
          </div>

          {/* Results Count and Actions */}
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {t('chat.searchResults')}:{' '}
              {isLoading ? (
                <span className="text-gray-400">
                  {t('chat.loadingSessions')} ({sessions.length}...)
                </span>
              ) : (
                t('chat.searchResultsCount', { count: filteredSessions.length })
              )}
            </p>

            {/* Selection Actions - shows when items are selected */}
            {selectedCount > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">
                  {t('chat.selectedCount', { count: selectedCount })}
                </span>
                <button
                  onClick={clearSelection}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {t('chat.clearSelection')}
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('chat.bulkDelete')}
                </button>
              </div>
            )}
          </div>

          {/* Loading State */}
          {isLoading && sessions.length === 0 && (
            <div className="py-12">
              <LoadingIndicator message={t('chat.loadingSessions')} />
            </div>
          )}

          {/* Sessions Table */}
          {!isLoading && filteredSessions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>{t('chat.searchNoResults')}</p>
            </div>
          ) : filteredSessions.length > 0 ? (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left w-12">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                        title={allFilteredSelected ? t('chat.deselectAll') : t('chat.selectAll')}
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('chat.sessionName')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('chat.updatedAt')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredSessions.map((session) => {
                    const isSelected = selectedSessionIds.has(session.sessionId);
                    return (
                      <tr
                        key={session.sessionId}
                        onClick={() => handleSessionClick(session.sessionId)}
                        className={`hover:bg-gray-50 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                      >
                        <td
                          className="px-4 py-4 cursor-pointer"
                          onClick={(e) => toggleSelection(session.sessionId, e)}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 pointer-events-none"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{session.title}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">
                            {formatDate(session.updatedAt)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Loading indicator for additional sessions */}
              {isLoading && (
                <div className="py-4 border-t border-gray-200 bg-gray-50">
                  <LoadingIndicator message="" spacing="none" />
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Bulk Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmBulkDelete}
        title={t('chat.bulkDelete')}
        message={t('chat.bulkDeleteConfirm', { count: selectedCount })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
      />
    </>
  );
}
