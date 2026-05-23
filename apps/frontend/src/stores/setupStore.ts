import { create } from "zustand";
import {
  testConnection,
  setupRemote,
  completeSetup,
  streamLocalK8sSetup,
} from "@/api/setup";
import type {
  SetupProgressEvent,
  TestConnectionResult,
} from "@/api/types";

type WizardStep = "welcome" | "local-progress" | "remote-form" | "complete";

interface RemoteForm {
  serverUrl: string;
  apiKey: string;
  protocol: "http" | "https";
}

interface SetupState {
  step: WizardStep;
  k8sMode: "local" | "remote" | null;
  remoteForm: RemoteForm;
  progressEvents: SetupProgressEvent[];
  overallProgress: number;
  error: string | null;
  testing: boolean;
  testResult: TestConnectionResult | null;
  submitting: boolean;

  setK8sMode: (mode: "local" | "remote") => void;
  startLocalSetup: () => void;
  updateRemoteForm: (field: keyof RemoteForm, value: string) => void;
  testRemoteConnection: () => Promise<void>;
  submitRemoteConfig: () => Promise<void>;
  goToDashboard: () => void;
  reset: () => void;
}

export const useSetupStore = create<SetupState>((set, get) => ({
  step: "welcome",
  k8sMode: null,
  remoteForm: { serverUrl: "", apiKey: "", protocol: "http" },
  progressEvents: [],
  overallProgress: 0,
  error: null,
  testing: false,
  testResult: null,
  submitting: false,

  setK8sMode: (mode) => {
    if (mode === "local") {
      set({ k8sMode: mode, step: "local-progress", error: null, progressEvents: [] });
      get().startLocalSetup();
    } else {
      set({ k8sMode: mode, step: "remote-form", error: null });
    }
  },

  startLocalSetup: () => {
    const cleanup = streamLocalK8sSetup(
      (event) => {
        set((state) => {
          // Update or append event
          const existing = state.progressEvents.findIndex((e) => e.step === event.step);
          const events = [...state.progressEvents];
          if (existing >= 0) {
            events[existing] = event;
          } else {
            events.push(event);
          }
          return {
            progressEvents: events,
            overallProgress: event.progress,
            error: event.status === "error" ? event.output ?? "Unknown error" : null,
          };
        });
      },
      (err) => {
        set({ error: err.message });
      },
      async () => {
        // Stream completed successfully — save config and finalize
        try {
          await completeSetup();
          set({ step: "complete", overallProgress: 100 });
        } catch (err) {
          set({ error: err instanceof Error ? err.message : String(err) });
        }
      },
    );

    // Store cleanup for potential abort (not used in this simple impl)
    // Could be extended to support cancellation
    void cleanup;
  },

  updateRemoteForm: (field, value) => {
    set((state) => ({
      remoteForm: { ...state.remoteForm, [field]: value },
      testResult: null,
    }));
  },

  testRemoteConnection: async () => {
    const { remoteForm } = get();
    set({ testing: true, testResult: null, error: null });
    try {
      const result = await testConnection({
        serverUrl: remoteForm.serverUrl,
        apiKey: remoteForm.apiKey,
        protocol: remoteForm.protocol,
      });
      set({ testing: false, testResult: result });
    } catch (err) {
      set({
        testing: false,
        testResult: { connected: false, error: err instanceof Error ? err.message : String(err) },
      });
    }
  },

  submitRemoteConfig: async () => {
    const { remoteForm } = get();
    set({ submitting: true, error: null });
    try {
      await setupRemote({
        serverUrl: remoteForm.serverUrl,
        apiKey: remoteForm.apiKey,
        protocol: remoteForm.protocol,
      });
      set({ step: "complete", submitting: false });
    } catch (err) {
      set({ submitting: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  goToDashboard: () => {
    window.location.href = "/dashboard";
  },

  reset: () => {
    set({
      step: "welcome",
      k8sMode: null,
      remoteForm: { serverUrl: "", apiKey: "", protocol: "http" },
      progressEvents: [],
      overallProgress: 0,
      error: null,
      testing: false,
      testResult: null,
      submitting: false,
    });
  },
}));
