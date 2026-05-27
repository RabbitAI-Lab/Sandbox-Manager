import { create } from "zustand";
import * as sandboxApi from "@/api/sandboxes";
import type { Sandbox, CreateSandboxRequest, ClusterResources } from "@/api/types";

interface SandboxState {
  sandboxes: Sandbox[];
  loading: boolean;
  error: string | null;
  clusterResources: ClusterResources | null;
  resourcesLoading: boolean;
  fetchSandboxes: () => Promise<void>;
  createSandbox: (req: CreateSandboxRequest) => Promise<Sandbox>;
  deleteSandbox: (id: string) => Promise<void>;
  pauseSandbox: (id: string) => Promise<void>;
  resumeSandbox: (id: string) => Promise<void>;
  fetchClusterResources: () => Promise<void>;
}

export const useSandboxStore = create<SandboxState>((set, get) => ({
  sandboxes: [],
  loading: false,
  error: null,
  clusterResources: null,
  resourcesLoading: false,

  fetchClusterResources: async () => {
    set({ resourcesLoading: true });
    try {
      const data = await sandboxApi.getClusterResources();
      set({ clusterResources: data, resourcesLoading: false });
    } catch {
      set({ resourcesLoading: false });
    }
  },

  fetchSandboxes: async () => {
    set({ loading: true, error: null });
    try {
      const result = await sandboxApi.listSandboxes();
      // SDK returns { items: Sandbox[], pagination: {...} } not a plain array
      const sandboxes = Array.isArray(result) ? result : (result as { items?: Sandbox[] }).items ?? [];
      set({ sandboxes, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  createSandbox: async (req: CreateSandboxRequest) => {
    const sandbox = await sandboxApi.createSandbox(req);
    // Refresh list
    await get().fetchSandboxes();
    return sandbox;
  },

  deleteSandbox: async (id: string) => {
    await sandboxApi.deleteSandbox(id);
    set((s) => ({ sandboxes: s.sandboxes.filter((sb) => sb.id !== id) }));
  },

  pauseSandbox: async (id: string) => {
    await sandboxApi.pauseSandbox(id);
    set((s) => ({
      sandboxes: s.sandboxes.map((sb) =>
        sb.id === id ? { ...sb, status: "Pausing" } : sb,
      ),
    }));
  },

  resumeSandbox: async (id: string) => {
    await sandboxApi.resumeSandbox(id);
    set((s) => ({
      sandboxes: s.sandboxes.map((sb) =>
        sb.id === id ? { ...sb, status: "Resuming" } : sb,
      ),
    }));
  },
}));
