/**
 * Route Explainer chat service. Posts a natural-language question about a
 * specific solved run to POST /api/chat (provider selected server-side by
 * AI_PROVIDER). The backend assembles context from the stored scenario.
 */

import { apiFetch } from '@/lib/api';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  project_id: string;
  run_id: string;
  message: string;
  history: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
  history: ChatMessage[];
}

export function sendChat(req: ChatRequest): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}
