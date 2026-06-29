/**
 * Route Explainer chat panel. Ports the legacy AI assistant: a slide-in panel
 * that asks POST /api/chat about the active run, renders the reply with light
 * markdown, and offers quick-prompt starters. History is per-run and resets
 * when the run changes.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sendChat, type ChatMessage } from '@/services/chat';
import { friendlyError } from '@/lib/errors';

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  runId: string;
}

const QUICK_PROMPTS = [
  'Why were some jobs left unassigned?',
  'Which engineer had the busiest day?',
  'Summarise this dispatch in plain English.',
];

/** Minimal, safe inline formatting: **bold**, *italic*, `code`. */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) nodes.push(<strong key={key++}>{m[1]}</strong>);
    else if (m[2] !== undefined) nodes.push(<em key={key++}>{m[2]}</em>);
    else if (m[3] !== undefined) nodes.push(<code key={key++}>{m[3]}</code>);
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Render an assistant reply as paragraphs, headings and bullet lists. */
function renderRich(text: string): ReactNode {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let key = 0;

  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={key++}>
          {list.map((li, i) => (
            <li key={i}>{renderInline(li)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^- /.test(line)) {
      list.push(line.slice(2));
      continue;
    }
    flushList();
    if (!line.trim()) continue;
    if (/^### /.test(line)) blocks.push(<h4 key={key++}>{renderInline(line.slice(4))}</h4>);
    else if (/^## /.test(line)) blocks.push(<h3 key={key++}>{renderInline(line.slice(3))}</h3>);
    else if (/^# /.test(line)) blocks.push(<h3 key={key++}>{renderInline(line.slice(2))}</h3>);
    else blocks.push(<p key={key++}>{renderInline(line)}</p>);
  }
  flushList();
  return blocks;
}

export function ChatPanel({ open, onClose, projectId, runId }: ChatPanelProps) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset the conversation when the run changes.
  useEffect(() => {
    setHistory([]);
    setInput('');
  }, [runId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, busy]);

  async function send(message: string) {
    const text = message.trim();
    if (!text || busy) return;
    setInput('');
    const priorHistory = history;
    setHistory([...priorHistory, { role: 'user', content: text }]);
    setBusy(true);
    try {
      const res = await sendChat({ project_id: projectId, run_id: runId, message: text, history: priorHistory });
      setHistory(res.history);
    } catch (err) {
      setHistory((h) => [
        ...h,
        { role: 'assistant', content: friendlyError(err, 'The assistant could not answer just now. Please try again.') },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className={`map-chat${open ? ' is-open' : ''}`} aria-hidden={!open} aria-label="Route assistant">
      <header className="map-chat-head">
        <h2 className="map-chat-title">Route assistant</h2>
        <button type="button" className="map-chat-close" onClick={onClose} aria-label="Close assistant">
          ✕
        </button>
      </header>

      <div className="map-chat-body" ref={scrollRef}>
        {history.length === 0 && !busy && (
          <div className="map-chat-empty">
            <p>Ask about this dispatch — assignments, timings, unassigned jobs, or a plain-English summary.</p>
            <div className="map-chat-prompts">
              {QUICK_PROMPTS.map((p) => (
                <button key={p} type="button" className="map-chat-prompt" onClick={() => void send(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {history.map((m, i) => (
          <div key={i} className={`map-chat-msg map-chat-msg-${m.role}`}>
            <span className="map-chat-avatar" aria-hidden="true">
              {m.role === 'user' ? 'You' : 'AI'}
            </span>
            <div className="map-chat-content">
              {m.role === 'user' ? m.content : renderRich(m.content)}
            </div>
          </div>
        ))}

        {busy && (
          <div className="map-chat-msg map-chat-msg-assistant" aria-live="polite">
            <span className="map-chat-avatar" aria-hidden="true">
              AI
            </span>
            <div className="map-chat-content map-chat-typing">Analysing telemetry…</div>
          </div>
        )}
      </div>

      <form
        className="map-chat-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          type="text"
          className="form-input"
          placeholder="Ask about this run…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          aria-label="Message the route assistant"
        />
        <button type="submit" className="map-chat-send" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}
