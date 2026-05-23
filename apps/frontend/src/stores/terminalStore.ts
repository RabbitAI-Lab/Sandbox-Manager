import { create } from "zustand";
import { randomUUID } from "@/lib/utils";

export interface TerminalSession {
  id: string;
  sandboxId: string;
  title: string;
  active: boolean;
}

interface TerminalState {
  sessions: TerminalSession[];
  addSession: (sandboxId: string, title?: string) => string;
  removeSession: (id: string) => void;
  setActive: (id: string) => void;
  getSessionsBySandbox: (sandboxId: string) => TerminalSession[];
  renameSession: (id: string, title: string) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],

  addSession: (sandboxId: string, title?: string) => {
    const id = randomUUID();
    const sessions = get().sessions;
    const count = sessions.filter((s) => s.sandboxId === sandboxId).length;
    set({
      sessions: [
        ...sessions.map((s) => ({ ...s, active: false })),
        {
          id,
          sandboxId,
          title: title ?? `Terminal ${count + 1}`,
          active: true,
        },
      ],
    });
    return id;
  },

  removeSession: (id: string) => {
    const sessions = get().sessions.filter((s) => s.id !== id);
    // Activate the last remaining session for this sandbox
    const last = sessions[sessions.length - 1];
    if (last) {
      set({ sessions: sessions.map((s) => ({ ...s, active: s.id === last.id })) });
    } else {
      set({ sessions });
    }
  },

  setActive: (id: string) => {
    set({
      sessions: get().sessions.map((s) => ({ ...s, active: s.id === id })),
    });
  },

  getSessionsBySandbox: (sandboxId: string) => {
    return get().sessions.filter((s) => s.sandboxId === sandboxId);
  },

  renameSession: (id: string, title: string) => {
    set({
      sessions: get().sessions.map((s) => (s.id === id ? { ...s, title } : s)),
    });
  },
}));
