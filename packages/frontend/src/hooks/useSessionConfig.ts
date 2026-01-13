/**
 * Session Configuration Hook
 * Manages session-specific settings (agent, working directory, model)
 * Syncs between global stores and session-specific configuration
 */

import { useEffect, useCallback, useRef } from 'react';
import { useSessionStore, type SessionConfig } from '../stores/sessionStore';
import { useAgentStore } from '../stores/agentStore';
import { useStorageStore } from '../stores/storageStore';
import { useSettingsStore } from '../stores/settingsStore';

interface UseSessionConfigOptions {
  sessionId: string | null;
}

interface UseSessionConfigReturn {
  /**
   * Get current session configuration
   */
  currentConfig: SessionConfig | null;

  /**
   * Save current global settings to the active session
   */
  saveCurrentConfigToSession: () => Promise<void>;

  /**
   * Restore session configuration to global stores
   */
  restoreConfigFromSession: () => void;
}

/**
 * Hook for managing session-specific configuration
 * 
 * This hook:
 * 1. Restores session settings when switching sessions
 * 2. Saves settings changes to the session when modified
 */
export function useSessionConfig({ sessionId }: UseSessionConfigOptions): UseSessionConfigReturn {
  const { getSessionConfig, setSessionConfig, saveSessionConfig, sessionConfigs } =
    useSessionStore();

  const { selectedAgent, selectAgent, agents } = useAgentStore();
  const { agentWorkingDirectory, setAgentWorkingDirectory } = useStorageStore();
  const { selectedModelId, setSelectedModelId } = useSettingsStore();

  // Track if we're in the middle of restoring config to prevent save loops
  const isRestoringRef = useRef(false);
  // Track the previous sessionId to detect changes
  const prevSessionIdRef = useRef<string | null>(null);

  const currentConfig = sessionId ? getSessionConfig(sessionId) : null;

  /**
   * Restore configuration from session to global stores
   */
  const restoreConfigFromSession = useCallback(() => {
    if (!sessionId) return;

    const config = getSessionConfig(sessionId);
    if (!config) {
      console.log(`⚠️ No config found for session ${sessionId}, using current global settings`);
      return;
    }

    console.log(`🔄 Restoring config for session ${sessionId}:`, config);
    isRestoringRef.current = true;

    try {
      // Restore agent selection
      if (config.agentId) {
        const agent = agents.find((a) => a.agentId === config.agentId);
        if (agent && selectedAgent?.agentId !== config.agentId) {
          selectAgent(agent);
        }
      } else if (selectedAgent !== null) {
        selectAgent(null);
      }

      // Restore working directory
      if (config.workingDirectory && agentWorkingDirectory !== config.workingDirectory) {
        setAgentWorkingDirectory(config.workingDirectory);
      }

      // Restore model
      if (config.modelId && selectedModelId !== config.modelId) {
        setSelectedModelId(config.modelId);
      }
    } finally {
      // Use setTimeout to ensure state updates are processed before clearing flag
      setTimeout(() => {
        isRestoringRef.current = false;
      }, 100);
    }
  }, [
    sessionId,
    getSessionConfig,
    agents,
    selectedAgent,
    selectAgent,
    agentWorkingDirectory,
    setAgentWorkingDirectory,
    selectedModelId,
    setSelectedModelId,
  ]);

  /**
   * Save current global settings to the active session
   */
  const saveCurrentConfigToSession = useCallback(async () => {
    if (!sessionId || isRestoringRef.current) return;

    const newConfig: SessionConfig = {
      agentId: selectedAgent?.agentId || null,
      workingDirectory: agentWorkingDirectory,
      modelId: selectedModelId,
    };

    // Update local cache immediately
    setSessionConfig(sessionId, newConfig);

    // Save to server (async, non-blocking)
    await saveSessionConfig(sessionId, newConfig);
  }, [
    sessionId,
    selectedAgent,
    agentWorkingDirectory,
    selectedModelId,
    setSessionConfig,
    saveSessionConfig,
  ]);

  // Restore config when session changes
  useEffect(() => {
    if (sessionId && sessionId !== prevSessionIdRef.current) {
      console.log(`📂 Session changed: ${prevSessionIdRef.current} -> ${sessionId}`);
      prevSessionIdRef.current = sessionId;

      // Check if this session has stored config
      const config = sessionConfigs[sessionId];
      if (config) {
        restoreConfigFromSession();
      } else {
        // New session or first time - capture current global state as initial config
        console.log(`📝 Capturing initial config for new session ${sessionId}`);
        const initialConfig: SessionConfig = {
          agentId: selectedAgent?.agentId || null,
          workingDirectory: agentWorkingDirectory,
          modelId: selectedModelId,
        };
        setSessionConfig(sessionId, initialConfig);
      }
    } else if (!sessionId) {
      prevSessionIdRef.current = null;
    }
  }, [
    sessionId,
    sessionConfigs,
    restoreConfigFromSession,
    selectedAgent,
    agentWorkingDirectory,
    selectedModelId,
    setSessionConfig,
  ]);

  return {
    currentConfig,
    saveCurrentConfigToSession,
    restoreConfigFromSession,
  };
}
