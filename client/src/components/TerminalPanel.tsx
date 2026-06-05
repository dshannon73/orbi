import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import { terminalApi, apiUrl } from '@/api';
import { useTerminalStore } from '@/store/terminal';

const PROVIDERS = [
  { id: 'google-workspace-rw',       label: 'Google Workspace' },
  { id: 'google-workspace-readonly', label: 'Google Workspace (read-only)' },
  { id: 'gus',                       label: 'GUS' },
  { id: 'git-soma',                  label: 'Git SOMA' },
  { id: 'git-emu',                   label: 'Git EMU' },
];

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null;
  const codeBlockRegex = /```[\s\S]*?```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  codeBlockRegex.lastIndex = 0;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(<InlineText key={key++} text={text.slice(lastIndex, match.index)} />);
    const inner = match[0].replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/, '');
    parts.push(
      <pre key={key++} style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 4, padding: '8px 12px', margin: '6px 0', overflowX: 'auto', fontSize: '0.8rem', color: '#e2e8f0', whiteSpace: 'pre' }}>
        {inner}
      </pre>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(<InlineText key={key++} text={text.slice(lastIndex)} />);
  return <>{parts}</>;
}

function InlineText({ text }: { text: string }) {
  const regex = /(\*\*[\s\S]*?\*\*|`[^`]+`)/g;
  const parts: React.ReactNode[] = [];
  let last = 0, key = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(<span key={key++}>{text.slice(last, match.index)}</span>);
    const raw = match[0];
    if (raw.startsWith('**')) {
      parts.push(<strong key={key++} style={{ color: '#f1f5f9' }}>{raw.slice(2, -2)}</strong>);
    } else {
      parts.push(<code key={key++} style={{ background: '#1e1e35', border: '1px solid #2a2a45', borderRadius: 3, padding: '0 4px', fontSize: '0.8em', color: '#a78bfa' }}>{raw.slice(1, -1)}</code>);
    }
    last = match.index + raw.length;
  }
  if (last < text.length) parts.push(<span key={key++}>{text.slice(last)}</span>);
  return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{parts}</span>;
}

function MessageLine({ msg }: { msg: { role: string; content: string; streaming?: boolean } }) {
  if (msg.role === 'system') return (
    <div style={{ color: '#4b5563', fontSize: '11px', marginBottom: 12, userSelect: 'none' }}>— {msg.content} —</div>
  );
  if (msg.role === 'user') return (
    <div style={{ marginBottom: 12 }}>
      <span style={{ color: '#f59e0b', fontWeight: 700, marginRight: 8 }}>orbi $</span>
      <span style={{ color: '#fbbf24' }}>{msg.content}</span>
    </div>
  );
  return (
    <div style={{ marginBottom: 16, color: '#d1d5db' }}>
      {renderMarkdown(msg.content)}
      {msg.streaming && (
        <span style={{ display: 'inline-block', width: 8, height: 14, background: '#e2e8f0', marginLeft: 2, verticalAlign: 'middle', animation: 'term-blink 1s step-end infinite' }} />
      )}
      <style>{`@keyframes term-blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  );
}

// ── TerminalPanel ─────────────────────────────────────────────────────────────

interface TerminalPanelProps {
  mode: 'panel' | 'page';
}

export default function TerminalPanel({ mode }: TerminalPanelProps) {
  const { messages, appendMessage, updateLastAssistant, addHistory, cmdHistory, clear, pendingPrompt, setPendingPrompt } = useTerminalStore();
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showAuth, setShowAuth] = useState(false);
  const [authProvider, setAuthProvider] = useState('google-workspace-rw');
  const [authRunning, setAuthRunning] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const submitRef = useRef<(text: string) => void>(() => {});

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { if (!streaming) inputRef.current?.focus(); }, [streaming]);

  // Auto-submit via ref so effect always calls the current submit
  useEffect(() => {
    if (!pendingPrompt || streaming) return;
    const text = pendingPrompt;
    setPendingPrompt(null);
    submitRef.current(text);
  }, [pendingPrompt]);

  const submit = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;

    addHistory(text);
    setHistoryIndex(-1);
    setInput('');

    const userMsg = { role: 'user' as const, content: text };
    appendMessage(userMsg);

    const apiMessages = [...messages.filter(m => m.role !== 'system'), userMsg].map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    appendMessage({ role: 'assistant', content: '', streaming: true });
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await terminalApi.run(apiMessages, controller.signal);
      if (!res.ok) {
        const errText = await res.text();
        updateLastAssistant(m => ({ ...m, content: `Error: ${errText}`, streaming: false }));
        setStreaming(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (controller.signal.aborted) { reader.cancel(); break; }

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'delta') {
              updateLastAssistant(m => ({ ...m, content: m.content + event.text }));
            } else if (event.type === 'done') {
              updateLastAssistant(m => ({ ...m, streaming: false }));
              setStreaming(false);
            } else if (event.type === 'error') {
              updateLastAssistant(m => ({ ...m, content: m.content + `\n[Error: ${event.message}]`, streaming: false }));
              setStreaming(false);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        updateLastAssistant(m => ({ ...m, content: `[Error: ${(err as Error).message}]`, streaming: false }));
      }
      setStreaming(false);
    }
  }, [input, streaming, messages, appendMessage, updateLastAssistant, addHistory]);

  // Keep ref current so the pendingPrompt effect always calls latest submit
  submitRef.current = submit;

  async function runAuth() {
    setAuthRunning(true);
    setShowAuth(false);
    appendMessage({ role: 'system', content: `Launching OAuth for ${authProvider}... (browser will open)` });

    try {
      const res = await fetch(apiUrl('/api/terminal/auth'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider: authProvider }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let output = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'delta') output += event.text;
            if (event.type === 'done') break;
          } catch { /* ignore */ }
        }
      }
      appendMessage({ role: 'system', content: `Auth complete. ${output.trim() || 'You can now retry your request.'}` });
    } catch (err: unknown) {
      appendMessage({ role: 'system', content: `Auth failed: ${(err as Error).message}` });
    }
    setAuthRunning(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      if (streaming && abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
        updateLastAssistant(m => ({ ...m, streaming: false, content: m.content + ' ^C' }));
        setStreaming(false);
      } else {
        setInput('');
        setHistoryIndex(-1);
      }
      return;
    }
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      clear();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(historyIndex + 1, cmdHistory.length - 1);
      setHistoryIndex(next);
      if (cmdHistory[next] !== undefined) setInput(cmdHistory[next]);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(historyIndex - 1, -1);
      setHistoryIndex(next);
      setInput(next === -1 ? '' : (cmdHistory[next] ?? ''));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  }

  const heightStyle = mode === 'page' ? '100vh' : '100%';

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: heightStyle, background: '#0d0d0d', fontFamily: 'var(--font-mono, "JetBrains Mono","Fira Code","Menlo",monospace)', fontSize: '13px', lineHeight: '1.6', color: '#e2e8f0', overflow: 'hidden' }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Toolbar */}
      <div style={{ borderBottom: '1px solid #1e1e2e', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: '#0a0a0a' }}>
        <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 12 }}>ORBI</span>
        <span style={{ color: '#2a2a3e', fontSize: 12 }}>|</span>
        <span style={{ color: '#4b5563', fontSize: 11 }}>Claude Code · SE Skills · Orbi API</span>
        <div style={{ flex: 1 }} />
        {/* Auth button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={e => { e.stopPropagation(); setShowAuth(v => !v); }}
            disabled={authRunning}
            style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#a78bfa', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {authRunning ? 'Authenticating...' : 'Auth'}
          </button>
          {showAuth && (
            <div
              style={{ position: 'absolute', right: 0, top: '110%', background: '#111128', border: '1px solid #2a2a3e', borderRadius: 6, padding: 10, zIndex: 50, minWidth: 240, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
              onClick={e => e.stopPropagation()}
            >
              <p style={{ color: '#6b7280', fontSize: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Re-authenticate provider</p>
              <select
                value={authProvider}
                onChange={e => setAuthProvider(e.target.value)}
                style={{ width: '100%', background: '#0d0d1a', border: '1px solid #2a2a3e', color: '#e2e8f0', borderRadius: 4, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit', marginBottom: 8 }}
              >
                {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <button
                onClick={runAuth}
                style={{ width: '100%', background: '#7c3aed', border: 'none', color: '#fff', borderRadius: 4, padding: '5px 0', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Open OAuth Flow
              </button>
            </div>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); clear(); }}
          style={{ background: 'transparent', border: 'none', color: '#4b5563', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
          title="Clear (Cmd+K)"
        >
          clear
        </button>
      </div>

      {/* Message area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 8px', scrollBehavior: 'smooth' }}>
        {messages.map((msg, i) => <MessageLine key={i} msg={msg} />)}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{ borderTop: '1px solid #1e1e2e', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, background: '#0d0d0d', flexShrink: 0 }}>
        <span style={{ color: '#f59e0b', userSelect: 'none', fontWeight: 700 }}>orbi $</span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={streaming ? 'streaming... (Ctrl+C to cancel)' : 'Type a prompt...'}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f59e0b', fontFamily: 'inherit', fontSize: 'inherit', caretColor: '#f59e0b' }}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        />
      </div>
    </div>
  );
}
