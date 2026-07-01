/**
 * Route Explainer chat service. Posts a natural-language question about a
 * specific solved run to POST /api/chat (provider selected server-side by
 * AI_PROVIDER). The backend assembles context from the stored scenario.
 */

import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';

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

/**
 * Stream a reply from POST /api/chat/stream. Invokes `onDelta` with the full
 * accumulated text after each Server-Sent Events frame, and resolves with the
 * final text once the `[DONE]` frame arrives. Throws on transport/HTTP error
 * so the caller can fall back to the blocking sendChat().
 */
export async function sendChatStream(
  req: ChatRequest,
  onDelta: (accumulated: string) => void,
): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);

  const res = await fetch('/api/chat/stream', {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
  });

  if (!res.ok || !res.body) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail ?? body?.error ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(`API ${res.status}: ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let acc = '';

  // Parse the SSE stream frame-by-frame (frames are separated by a blank line).
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return acc;
        try {
          acc += JSON.parse(payload) as string;
          onDelta(acc);
        } catch {
          /* keep partial frames until they complete */
        }
      }
    }
  }
  return acc;
}
