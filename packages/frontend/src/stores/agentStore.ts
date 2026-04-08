/**
 * Agent management Zustand store (API + LocalStorage)
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Agent, CreateAgentInput, UpdateAgentInput, AgentStore } from '../types/agent';
import * as agentsApi from '../api/agents';
import { logger } from '../utils/logger';
import { extractErrorMessage } from '../utils/store-helpers';
import { useStorageStore } from './storageStore';
import { useSessionStore } from './sessionStore';
import { useChatStore } from './chatStore';

/**
 * AgentStore implementation
 */
export const useAgentStore = create<AgentStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        agents: [],
        selectedAgent: null,
        isLoading: false,
        error: null,

        // Agent CRUD operations
        createAgent: async (input: CreateAgentInput) => {
          set({ isLoading: true, error: null });

          try {
            const newAgent = await agentsApi.createAgent(input);

            set((state) => ({
              agents: [...state.agents, newAgent],
              isLoading: false,
              error: null,
            }));

            return newAgent;
          } catch (error) {
            const errorMessage = extractErrorMessage(error, 'Failed to create agent');
            set({ isLoading: false, error: errorMessage });
            throw error;
          }
        },

        updateAgent: async (input: UpdateAgentInput) => {
          set({ isLoading: true, error: null });

          try {
            const updatedAgent = await agentsApi.updateAgent(input.agentId, input);

            set((state) => {
              const agentIndex = state.agents.findIndex((agent) => agent.agentId === input.agentId);
              const updatedAgents = [...state.agents];

              if (agentIndex !== -1) {
                updatedAgents[agentIndex] = updatedAgent;
              }

              // Update selection if the selected agent was updated
              const updatedSelectedAgent =
                state.selectedAgent?.agentId === input.agentId ? updatedAgent : state.selectedAgent;

              return {
                agents: updatedAgents,
                selectedAgent: updatedSelectedAgent,
                isLoading: false,
                error: null,
              };
            });
          } catch (error) {
            const errorMessage = extractErrorMessage(error, 'Failed to update agent');
            set({ isLoading: false, error: errorMessage });
            throw error;
          }
        },

        deleteAgent: async (agentId: string) => {
          set({ isLoading: true, error: null });

          try {
            await agentsApi.deleteAgent(agentId);

            set((state) => {
              const updatedAgents = state.agents.filter((agent) => agent.agentId !== agentId);

              // Clear selection if the deleted agent was selected
              const updatedSelectedAgent =
                state.selectedAgent?.agentId === agentId ? null : state.selectedAgent;

              return {
                agents: updatedAgents,
                selectedAgent: updatedSelectedAgent,
                isLoading: false,
                error: null,
              };
            });
          } catch (error) {
            const errorMessage = extractErrorMessage(error, 'Failed to delete agent');
            set({ isLoading: false, error: errorMessage });
            throw error;
          }
        },

        getAgent: (agentId: string) => {
          return get().agents.find((agent) => agent.agentId === agentId);
        },

        // Share functionality
        toggleShare: async (agentId: string) => {
          set({ isLoading: true, error: null });

          try {
            const updatedAgent = await agentsApi.toggleShareAgent(agentId);

            set((state) => {
              const agentIndex = state.agents.findIndex((agent) => agent.agentId === agentId);
              const updatedAgents = [...state.agents];

              if (agentIndex !== -1) {
                updatedAgents[agentIndex] = updatedAgent;
              }

              // Update selection if the selected agent was updated
              const updatedSelectedAgent =
                state.selectedAgent?.agentId === agentId ? updatedAgent : state.selectedAgent;

              return {
                agents: updatedAgents,
                selectedAgent: updatedSelectedAgent,
                isLoading: false,
                error: null,
              };
            });

            return updatedAgent;
          } catch (error) {
            const errorMessage = extractErrorMessage(error, 'Failed to toggle agent share status');
            set({ isLoading: false, error: errorMessage });
            throw error;
          }
        },

        // Select agent
        selectAgent: (agent: Agent | null) => {
          set({ selectedAgent: agent });
          // Apply default storage path if agent has one, but only if no messages exist in current session
          if (agent?.defaultStoragePath) {
            const activeSessionId = useSessionStore.getState().activeSessionId;
            const sessions = useChatStore.getState().sessions;
            const currentSession = activeSessionId ? sessions[activeSessionId] : null;
            const hasMessages = currentSession?.messages && currentSession.messages.length > 0;

            // Don't change working directory if session already has messages
            if (!hasMessages) {
              useStorageStore.getState().setAgentWorkingDirectory(agent.defaultStoragePath);
            }
          }
        },

        // Utilities
        initializeStore: async () => {
          set({ isLoading: true, error: null });

          try {
            logger.log('🔧 AgentStore initialization started...');

            // Fetch agent list from API
            let agents = await agentsApi.listAgents();

            // Initialize default agents only when list is empty
            if (agents.length === 0) {
              logger.log('📝 First login detected - initializing default agents...');
              const result = await agentsApi.initializeAgents();
              agents = result.agents;
              logger.log(`✨ Default agents created: ${agents.length} items`);
            }

            // Restore selected agent from persisted state
            const currentSelectedAgent = get().selectedAgent;
            let selectedAgent: Agent | null = null;

            if (currentSelectedAgent) {
              selectedAgent =
                agents.find((a) => a.agentId === currentSelectedAgent.agentId) || null;
            }

            // Select first agent if none is selected
            if (!selectedAgent && agents.length > 0) {
              selectedAgent = agents[0];
            }

            logger.log(`✅ AgentStore initialization complete: ${agents.length} items`);

            set({
              agents,
              selectedAgent,
              isLoading: false,
              error: null,
            });
          } catch (error) {
            logger.error('💥 AgentStore initialization error:', error);
            set({
              agents: [],
              selectedAgent: null,
              isLoading: false,
              error: extractErrorMessage(error, 'Failed to initialize store'),
            });
          }
        },

        refreshAgents: async () => {
          // Background refresh (no loading state to keep existing data visible)
          try {
            logger.log('🔄 Refreshing agent list in background...');
            const agents = await agentsApi.listAgents();

            set((state) => {
              // Verify selected agent still exists; keep selection if it does
              const selectedAgent = state.selectedAgent
                ? agents.find((a) => a.agentId === state.selectedAgent?.agentId) ||
                  state.selectedAgent
                : null;

              return {
                agents,
                selectedAgent,
              };
            });

            logger.log(`✅ Agent list refresh complete: ${agents.length} items`);
          } catch (error) {
            // Silently handle errors (keep existing data)
            logger.error('💥 Agent list refresh error:', error);
          }
        },

        clearError: () => {
          set({ error: null });
        },

        clearStore: () => {
          logger.log('🧹 Clearing AgentStore...');
          set({
            agents: [],
            selectedAgent: null,
            isLoading: false,
            error: null,
          });
        },
      }),
      {
        name: 'agentcore-selected-agent',
        partialize: (state) => ({
          selectedAgent: state.selectedAgent,
        }),
      }
    ),
    {
      name: 'agent-store',
      enabled: import.meta.env.DEV,
    }
  )
);

/**
 * Helper hook to get the selected agent
 */
export const useSelectedAgent = () => {
  return useAgentStore((state) => state.selectedAgent);
};

/**
 * Helper hook to get the agent list
 */
export const useAgents = () => {
  return useAgentStore((state) => state.agents);
};
