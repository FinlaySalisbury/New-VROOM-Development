/**
 * Route Explainer chat panel. Ports the legacy AI assistant: a slide-in panel
 * that asks POST /api/chat about the active run, renders the reply with light
 * markdown, and offers quick-prompt starters. History is per-run and resets
 * when the run changes.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sendChat, sendChatStream, type ChatMessage } from '@/services/chat';
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

/** Split a markdown table row into trimmed cells, dropping the outer pipes. */
function splitRow(row: string): string[] {
  const cells = row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  return cells.map((c) => c.trim());
}

const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;

/** Column alignment parsed from a table separator cell (`:--`, `:--:`, `--:`). */
function colAlign(sep: string): 'left' | 'center' | 'right' {
  const s = sep.trim();
  const l = s.startsWith(':');
  const r = s.endsWith(':');
  if (l && r) return 'center';
  if (r) return 'right';
  return 'left';
}

/**
 * Tone a status cell so key outcomes read at a glance. Danger maps to Royal
 * Blue (the brand has no red); positive outcomes map to Green.
 */
function cellTone(text: string): '' | 'cell-pos' | 'cell-neg' {
  const t = text.toLowerCase();
  if (/\b(unassigned|dropped|missed|late|over\b|overrun|fail|breach|infeasible)/.test(t)) return 'cell-neg';
  if (/\b(assigned|on[- ]?time|converged|ok\b|within|met\b|feasible|success)/.test(t)) return 'cell-pos';
  return '';
}

/** Render a GFM table (header + separator already validated by the caller). */
function renderTable(header: string, sep: string, body: string[], key: number): ReactNode {
  const heads = splitRow(header);
  const aligns = splitRow(sep).map(colAlign);
  const rows = body.map(splitRow);
  return (
    <div className="map-chat-table-wrap" key={key}>
      <table>
        <thead>
          <tr>
            {heads.map((h, i) => (
              <th key={i} style={{ textAlign: aligns[i] ?? 'left' }}>
                {renderInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r}>
              {cells.map((c, i) => (
                <td key={i} className={cellTone(c)} style={{ textAlign: aligns[i] ?? 'left' }}>
                  {renderInline(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Render an assistant reply as paragraphs, headings, bullet lists and tables. */
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    // Table: a pipe header row immediately followed by a separator row.
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flushList();
      const header = line;
      const sep = lines[i + 1];
      const body: string[] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim()) {
        body.push(lines[j]);
        j++;
      }
      blocks.push(renderTable(header, sep, body, key++));
      i = j - 1;
      continue;
    }

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
    const withUser: ChatMessage[] = [...priorHistory, { role: 'user', content: text }];
    setHistory(withUser);
    setBusy(true);

    const req = { project_id: projectId, run_id: runId, message: text, history: priorHistory };

    // Update the trailing assistant message in place as deltas stream in.
    const paint = (content: string) =>
      setHistory([...withUser, { role: 'assistant', content }]);

    try {
      const reply = await sendChatStream(req, paint);
      setHistory([...withUser, { role: 'assistant', content: reply }]);
    } catch {
      // Streaming failed (proxy, network, or endpoint) — fall back to blocking.
      try {
        const res = await sendChat(req);
        setHistory(res.history);
      } catch (err) {
        setHistory([
          ...withUser,
          {
            role: 'assistant',
            content: friendlyError(err, 'The assistant could not answer just now. Please try again.'),
          },
        ]);
      }
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

        {busy && history[history.length - 1]?.role === 'user' && (
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
