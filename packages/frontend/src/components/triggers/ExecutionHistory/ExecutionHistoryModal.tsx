/**
 * ExecutionHistoryModal Component
 *
 * Modal for displaying trigger execution history
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ModalHeader, ModalContent, ModalCloseButton } from '../../ui/Modal';
import { ExecutionList } from './ExecutionList';
import { getExecutionHistory } from '../../../api/triggers';
import type { ExecutionRecord } from '../../../types/trigger';
import toast from 'react-hot-toast';

export interface ExecutionHistoryModalProps {
  /**
   * Whether the modal is open
   */
  isOpen: boolean;

  /**
   * Callback when modal is closed
   */
  onClose: () => void;

  /**
   * Trigger ID to show history for
   */
  triggerId: string;

  /**
   * Trigger name for display
   */
  triggerName: string;
}

export function ExecutionHistoryModal({
  isOpen,
  onClose,
  triggerId,
  triggerName,
}: ExecutionHistoryModalProps) {
  const { t } = useTranslation();
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [nextToken, setNextToken] = useState<string | undefined>();

  const loadExecutions = useCallback(
    async (token?: string) => {
      setIsLoading(true);

      try {
        const response = await getExecutionHistory(triggerId, undefined, token);

        if (token) {
          // Append to existing executions
          setExecutions((prev) => [...prev, ...response.executions]);
        } else {
          // Replace executions
          setExecutions(response.executions);
        }

        setNextToken(response.nextToken);
      } catch (error) {
        console.error('Failed to load executions:', error);
        toast.error(t('triggers.messages.fetchError'));
      } finally {
        setIsLoading(false);
      }
    },
    [triggerId, t]
  );

  // Fetch execution history
  useEffect(() => {
    if (isOpen && triggerId) {
      loadExecutions();
    }
  }, [isOpen, triggerId, loadExecutions]);

  const handleLoadMore = () => {
    if (nextToken && !isLoading) {
      loadExecutions(nextToken);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalHeader>
        <div>
          <h2 className="text-xl font-bold text-gray-900">{t('triggers.history.title')}</h2>
          <p className="text-sm text-gray-600 mt-1">{triggerName}</p>
        </div>
        <ModalCloseButton />
      </ModalHeader>

      <ModalContent className="h-[600px] overflow-y-auto">
        <ExecutionList
          executions={executions}
          isLoading={isLoading}
          hasMore={!!nextToken}
          onLoadMore={handleLoadMore}
        />
      </ModalContent>
    </Modal>
  );
}
