import { create } from "zustand";
import {
  listDomains as apiListDomains,
  addDomain as apiAddDomain,
  removeDomain as apiRemoveDomain,
  updateDomains as apiUpdateDomains,
} from "@/api/domains";

interface DomainState {
  domains: string[];
  loading: boolean;
  error: string | null;

  fetchDomains: () => Promise<void>;
  addDomain: (domain: string) => Promise<void>;
  removeDomain: (domain: string) => Promise<void>;
  updateDomains: (domains: string[]) => Promise<void>;
  clearError: () => void;
}

export const useDomainStore = create<DomainState>((set, get) => ({
  domains: [],
  loading: false,
  error: null,

  fetchDomains: async () => {
    set({ loading: true, error: null });
    try {
      const domains = await apiListDomains();
      set({ domains, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  addDomain: async (domain: string) => {
    set({ error: null });
    try {
      const domains = await apiAddDomain(domain);
      set({ domains });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  removeDomain: async (domain: string) => {
    set({ error: null });
    try {
      const domains = await apiRemoveDomain(domain);
      set({ domains });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  updateDomains: async (domains: string[]) => {
    set({ error: null });
    try {
      const result = await apiUpdateDomains(domains);
      set({ domains: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));
