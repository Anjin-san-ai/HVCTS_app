import { useState, useRef, useEffect, useCallback } from 'react';
import { fetchAssistant } from '../services/llm';
import type { CaseworkerCase } from '../types';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  tokens?: number;
}

interface AiAssistantProps {
  caseData: CaseworkerCase;
  isOpen: boolean;
  onToggle: () => void;
}

const QUICK_ACTIONS = [
  { label: 'Summarize risks', prompt: 'What are the key risks in this case and what should I watch out for before issuing a decision?' },
  { label: 'Check appeal exposure', prompt: 'Assess the Valuation Tribunal appeal risk. What specific weaknesses would a tribunal panel likely challenge?' },
  { label: 'Ownership gaps', prompt: 'Are there any gaps or concerns in the ownership chain? What verification steps should I take?' },
  { label: 'Evidence sufficient?', prompt: 'Is the current evidence package sufficient to support a decision, or should I request more evidence before proceeding?' },
  { label: 'DLM impact', prompt: 'What are the DLM implications if I change the band? Walk me through the cross-list effects.' },
  { label: 'Suggest next steps', prompt: 'Based on everything assembled so far, what are the most efficient next steps to resolve this case?' },
];

export function AiAssistant({ caseData, isOpen, onToggle }: AiAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const buildHistory = useCallback(() => {
    return messages.map((m) => `${m.role === 'user' ? 'Caseworker' : 'AI'}: ${m.text}`).join('\n');
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = {
      role: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const history = buildHistory();
    const res = await fetchAssistant(caseData, text.trim(), history || undefined);

    let answerText = res.error || 'Unable to process request. Check that the API server is running.';
    if (res.success && res.data?.answer) {
      answerText = res.data.answer;
      // If the LLM returned JSON, extract readable text
      if (answerText.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(answerText);
          const parts: string[] = [];
          for (const [key, val] of Object.entries(parsed)) {
            if (Array.isArray(val)) {
              parts.push(`${key.replace(/_/g, ' ')}:`);
              (val as string[]).forEach((item, i) => parts.push(`${i + 1}. ${String(item)}`));
            } else if (typeof val === 'string') {
              parts.push(`${key.replace(/_/g, ' ')}: ${val}`);
            }
          }
          if (parts.length > 0) answerText = parts.join('\n');
        } catch { /* use raw text */ }
      }
    }

    const assistantMsg: Message = {
      role: 'assistant',
      text: answerText,
      timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      tokens: res.tokens?.total,
    };

    if (res.model) setModel(res.model);
    setMessages((prev) => [...prev, assistantMsg]);
    setLoading(false);
  }, [caseData, loading, buildHistory]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (!isOpen) {
    return (
      <button onClick={onToggle} style={styles.fab} title="AI Assistant">
        <span style={{ fontSize: 20 }}>AI</span>
      </button>
    );
  }

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>AI Case Assistant</div>
          <div style={styles.headerSub}>
            {caseData.reference} · {model || 'Ready'}
          </div>
        </div>
        <button onClick={onToggle} style={styles.closeBtn}>✕</button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={styles.messages}>
        {messages.length === 0 && (
          <div style={styles.empty}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Ask me anything about this case</div>
            <div style={{ fontSize: 13, color: '#505a5f', marginBottom: 16 }}>
              I have the full case context — property details, evidence, ownership chain, comparables, and band thresholds.
            </div>
            <div style={styles.quickActions}>
              {QUICK_ACTIONS.map((qa) => (
                <button key={qa.label} style={styles.quickBtn} onClick={() => sendMessage(qa.prompt)}>
                  {qa.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ ...styles.msgRow, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={msg.role === 'user' ? styles.userBubble : styles.aiBubble}>
              <div style={styles.msgText}>{msg.text}</div>
              <div style={styles.msgMeta}>
                {msg.timestamp}
                {msg.tokens ? ` · ${msg.tokens} tokens` : ''}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ ...styles.msgRow, justifyContent: 'flex-start' }}>
            <div style={styles.aiBubble}>
              <div style={{ ...styles.msgText, color: '#505a5f' }}>Analysing case data<span className="typing-cursor">|</span></div>
            </div>
          </div>
        )}
      </div>

      {/* Quick actions (shown after messages too) */}
      {messages.length > 0 && (
        <div style={styles.quickBar}>
          {QUICK_ACTIONS.slice(0, 3).map((qa) => (
            <button key={qa.label} style={styles.quickBtnSmall} onClick={() => sendMessage(qa.prompt)}>
              {qa.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={styles.inputBar}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this case..."
          style={styles.textarea}
          rows={1}
          disabled={loading}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          style={{ ...styles.sendBtn, opacity: input.trim() && !loading ? 1 : 0.4 }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  fab: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: '#003078',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"GDS Transport", Arial, sans-serif',
    fontWeight: 700,
    zIndex: 9000,
  },
  panel: {
    position: 'fixed',
    bottom: 0,
    right: 0,
    width: 420,
    height: '100vh',
    background: '#fff',
    borderLeft: '1px solid #b1b4b6',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 9200,
    boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
    fontFamily: '"GDS Transport", Arial, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: '#003078',
    color: '#fff',
    flexShrink: 0,
  },
  headerTitle: { fontSize: 16, fontWeight: 700 },
  headerSub: { fontSize: 12, opacity: 0.8, marginTop: 2 },
  closeBtn: {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.4)',
    color: '#fff',
    fontSize: 16,
    width: 32,
    height: 32,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px',
  },
  empty: {
    padding: '20px 0',
    textAlign: 'center' as const,
  },
  quickActions: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
    justifyContent: 'center',
  },
  quickBtn: {
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 700,
    background: '#f3f2f1',
    border: '1px solid #b1b4b6',
    cursor: 'pointer',
    fontFamily: '"GDS Transport", Arial, sans-serif',
    color: '#0b0c0c',
  },
  quickBar: {
    display: 'flex',
    gap: 4,
    padding: '4px 16px 8px',
    flexShrink: 0,
  },
  quickBtnSmall: {
    padding: '3px 8px',
    fontSize: 11,
    background: '#f3f2f1',
    border: '1px solid #b1b4b6',
    cursor: 'pointer',
    fontFamily: '"GDS Transport", Arial, sans-serif',
    color: '#505a5f',
  },
  msgRow: {
    display: 'flex',
    marginBottom: 10,
  },
  userBubble: {
    maxWidth: '85%',
    padding: '8px 12px',
    background: '#1d70b8',
    color: '#fff',
    borderRadius: '12px 12px 2px 12px',
    fontSize: 14,
    lineHeight: 1.5,
  },
  aiBubble: {
    maxWidth: '85%',
    padding: '8px 12px',
    background: '#f3f2f1',
    color: '#0b0c0c',
    borderRadius: '12px 12px 12px 2px',
    fontSize: 14,
    lineHeight: 1.5,
    borderLeft: '3px solid #003078',
  },
  msgText: { whiteSpace: 'pre-wrap' as const },
  msgMeta: { fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: 'right' as const },
  inputBar: {
    display: 'flex',
    gap: 8,
    padding: '10px 16px',
    borderTop: '1px solid #b1b4b6',
    background: '#f3f2f1',
    flexShrink: 0,
  },
  textarea: {
    flex: 1,
    border: '1px solid #b1b4b6',
    padding: '8px 10px',
    fontSize: 14,
    fontFamily: '"GDS Transport", Arial, sans-serif',
    resize: 'none' as const,
    outline: 'none',
    minHeight: 36,
  },
  sendBtn: {
    padding: '8px 16px',
    background: '#003078',
    color: '#fff',
    border: 'none',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: '"GDS Transport", Arial, sans-serif',
    flexShrink: 0,
  },
};
