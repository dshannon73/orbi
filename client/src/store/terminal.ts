import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TerminalMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
}

interface TerminalState {
  messages: TerminalMessage[];
  cmdHistory: string[];
  pendingPrompt: string | null;
  panelOpen: boolean;
  setMessages: (msgs: TerminalMessage[]) => void;
  appendMessage: (msg: TerminalMessage) => void;
  updateLastAssistant: (fn: (prev: TerminalMessage) => TerminalMessage) => void;
  addHistory: (cmd: string) => void;
  clear: () => void;
  setPendingPrompt: (p: string | null) => void;
  setPanelOpen: (open: boolean) => void;
}

const WELCOME: TerminalMessage = {
  role: 'system',
  content: 'Orbi Terminal · Full Claude Code + Orbi data access · Type anything, use bash, ask about your SF data',
};

export const useTerminalStore = create<TerminalState>()(
  persist(
    (set) => ({
      messages: [WELCOME],
      cmdHistory: [],
      pendingPrompt: null,
      panelOpen: false,

      setMessages: (messages) => set({ messages }),

      appendMessage: (msg) => set(s => ({ messages: [...s.messages, msg] })),

      updateLastAssistant: (fn) => set(s => {
        const msgs = [...s.messages];
        const last = msgs[msgs.length - 1];
        if (last?.role === 'assistant') msgs[msgs.length - 1] = fn(last);
        return { messages: msgs };
      }),

      addHistory: (cmd) => set(s => ({
        cmdHistory: [cmd, ...s.cmdHistory.filter(h => h !== cmd)].slice(0, 50),
      })),

      clear: () => set({ messages: [WELCOME] }),

      setPendingPrompt: (pendingPrompt) => set({ pendingPrompt }),
      setPanelOpen: (panelOpen) => set({ panelOpen }),
    }),
    {
      name: 'orbi-terminal-v1',
      partialize: (s) => ({
        messages: s.messages.filter(m => !m.streaming).slice(-200),
        cmdHistory: s.cmdHistory,
        panelOpen: s.panelOpen,
      }),
    },
  ),
);
