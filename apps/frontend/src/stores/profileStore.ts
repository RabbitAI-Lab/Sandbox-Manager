import { create } from "zustand";
import {
  listProfiles,
  createProfile as apiCreateProfile,
  updateProfile as apiUpdateProfile,
  deleteProfile as apiDeleteProfile,
  switchProfile as apiSwitchProfile,
} from "@/api/profiles";
import type { ServerProfile, CreateProfileBody, UpdateProfileBody } from "@/api/types";

interface ProfileState {
  profiles: ServerProfile[];
  activeProfileId: string | null;
  loading: boolean;
  switching: boolean;
  error: string | null;

  fetchProfiles: () => Promise<void>;
  createProfile: (data: CreateProfileBody) => Promise<void>;
  updateProfile: (id: string, data: UpdateProfileBody) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  switchProfile: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  activeProfileId: null,
  loading: false,
  switching: false,
  error: null,

  fetchProfiles: async () => {
    set({ loading: true, error: null });
    try {
      const data = await listProfiles();
      set({ profiles: data.profiles, activeProfileId: data.activeProfileId, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  createProfile: async (data: CreateProfileBody) => {
    set({ error: null });
    try {
      await apiCreateProfile(data);
      await get().fetchProfiles();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  updateProfile: async (id: string, data: UpdateProfileBody) => {
    set({ error: null });
    try {
      await apiUpdateProfile(id, data);
      await get().fetchProfiles();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  deleteProfile: async (id: string) => {
    set({ error: null });
    try {
      await apiDeleteProfile(id);
      await get().fetchProfiles();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  switchProfile: async (id: string) => {
    set({ switching: true, error: null });
    try {
      await apiSwitchProfile(id);
      // Full page reload to reset all stores and WebSocket connections
      window.location.href = "/dashboard";
    } catch (err) {
      set({ switching: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  clearError: () => set({ error: null }),
}));
