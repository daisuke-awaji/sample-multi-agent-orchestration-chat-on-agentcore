/**
 * Events API client
 * API for retrieving available event sources
 */

import { backendGet } from './client/backend-client';

export interface EventSource {
  id: string;
  name: string;
  description: string;
  icon?: string;
}

export interface EventSourcesResponse {
  eventSources: EventSource[];
  metadata?: {
    requestId: string;
    timestamp: string;
    count: number;
  };
}

/**
 * Get available event sources
 */
export async function getEventSources(): Promise<EventSource[]> {
  const data = await backendGet<EventSourcesResponse>('/events');
  return data.eventSources;
}
