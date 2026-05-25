import { useState, useEffect } from "react";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { useProfileStore } from "@/stores/profileStore";
import { useDomainStore } from "@/stores/domainStore";
import { testConnection } from "@/api/setup";
import { testProfile } from "@/api/profiles";
import type { ServerProfile, TestConnectionResult } from "@/api/types";

type FormMode = "idle" | "add" | "edit";

export function ServerSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profiles, activeProfileId, loading, switching, fetchProfiles, createProfile, updateProfile, deleteProfile, switchProfile, error, clearError } = useProfileStore();
  const { domains, activeDomain, loading: domainsLoading, fetchDomains, addDomain, removeDomain, activateDomain, error: domainError, clearError: clearDomainError } = useDomainStore();

  const [formMode, setFormMode] = useState<FormMode>("idle");
  const [editingProfile, setEditingProfile] = useState<ServerProfile | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [apiKeyDirty, setApiKeyDirty] = useState(false);

  // Form fields
  const [formName, setFormName] = useState("");
  const [formServerUrl, setFormServerUrl] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formProtocol, setFormProtocol] = useState<"http" | "https">("http");
  const [showApiKey, setShowApiKey] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Domain form
  const [newDomain, setNewDomain] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);

  useEffect(() => {
    if (open) {
      fetchProfiles();
      fetchDomains();
      resetForm();
    }
  }, [open, fetchProfiles, fetchDomains]);

  function resetForm() {
    setFormMode("idle");
    setEditingProfile(null);
    setFormName("");
    setFormServerUrl("");
    setFormApiKey("");
    setFormProtocol("http");
    setShowApiKey(false);
    setTestingConn(false);
    setTestResult(null);
    setSubmitting(false);
    setDeleteConfirmId(null);
    setApiKeyDirty(false);
    clearError();
  }

  function startAdd() {
    setFormMode("add");
    setEditingProfile(null);
    setFormName("");
    setFormServerUrl("");
    setFormApiKey("");
    setFormProtocol("http");
    setTestResult(null);
    setApiKeyDirty(false);
  }

  function startEdit(profile: ServerProfile) {
    setFormMode("edit");
    setEditingProfile(profile);
    setFormName(profile.name);
    setFormServerUrl(profile.serverUrl);
    setFormApiKey(profile.apiKey);
    setFormProtocol(profile.protocol);
    setTestResult(null);
    setApiKeyDirty(false);
  }

  async function handleTest() {
    setTestingConn(true);
    setTestResult(null);
    try {
      let result: TestConnectionResult;
      if (formMode === "edit" && editingProfile && !apiKeyDirty) {
        // Key unchanged — use the profile test endpoint which reads the full key from servers.json
        result = await testProfile(editingProfile.id);
      } else {
        // New profile or key was manually changed — test with form values
        result = await testConnection({
          serverUrl: formServerUrl,
          apiKey: formApiKey,
          protocol: formProtocol,
        });
      }
      setTestResult(result);
    } catch (err) {
      setTestResult({ connected: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTestingConn(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      if (formMode === "add") {
        await createProfile({ name: formName, serverUrl: formServerUrl, apiKey: formApiKey, protocol: formProtocol });
      } else if (formMode === "edit" && editingProfile) {
        await updateProfile(editingProfile.id, {
          name: formName,
          serverUrl: formServerUrl,
          apiKey: formApiKey,
          protocol: formProtocol,
        });
      }
      resetForm();
    } catch {
      // Error is set in the store
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSwitch(id: string) {
    await switchProfile(id);
  }

  async function handleDelete(id: string) {
    await deleteProfile(id);
    setDeleteConfirmId(null);
  }

  async function handleAddDomain() {
    if (!newDomain.trim()) return;
    setAddingDomain(true);
    clearDomainError();
    try {
      await addDomain(newDomain.trim());
      setNewDomain("");
    } catch {
      // error is set in store
    } finally {
      setAddingDomain(false);
    }
  }

  async function handleRemoveDomain(domain: string) {
    await removeDomain(domain);
  }

  const isFormValid = formName.trim() && formServerUrl.trim() && formApiKey.trim();

  return (
    <Modal
      open={open}
      onClose={() => { resetForm(); onClose(); }}
      title="Server Configuration"
    >
      <div className="space-y-4">
        {/* Error banner */}
        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2.5">{error}</div>
        )}

        {/* Profile list */}
        <div className="space-y-2">
          {loading ? (
            <div className="text-center text-sm text-gray-400 py-6">Loading...</div>
          ) : profiles.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-6">
              No server profiles yet. Add one to get started.
            </div>
          ) : (
            profiles.map((profile) => (
              <div
                key={profile.id}
                className={`rounded-lg border p-3 transition-colors ${
                  profile.id === activeProfileId
                    ? "border-green-300 bg-green-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Active indicator */}
                    {profile.id === activeProfileId ? (
                      <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">{profile.name}</span>
                        <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                          {profile.protocol}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 truncate">{profile.serverUrl}</div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {profile.id !== activeProfileId && (
                      <button
                        onClick={() => handleSwitch(profile.id)}
                        disabled={switching}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 disabled:opacity-50"
                      >
                        {switching ? "..." : "Switch"}
                      </button>
                    )}
                    {profile.id === activeProfileId && (
                      <span className="text-xs font-medium text-green-600 px-2 py-1">Active</span>
                    )}
                    <button
                      onClick={() => startEdit(profile)}
                      className="text-xs text-gray-500 hover:text-gray-700 px-1.5 py-1 rounded hover:bg-gray-100"
                    >
                      Edit
                    </button>
                    {profiles.length > 1 && deleteConfirmId === profile.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(profile.id)}
                          className="text-xs font-medium text-red-600 hover:text-red-700 px-1.5 py-1 rounded hover:bg-red-50"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="text-xs text-gray-500 hover:text-gray-700 px-1.5 py-1 rounded hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : profiles.length > 1 ? (
                      <button
                        onClick={() => setDeleteConfirmId(profile.id)}
                        className="text-xs text-gray-500 hover:text-red-600 px-1.5 py-1 rounded hover:bg-red-50"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add / Edit form */}
        {formMode === "idle" ? (
          <Button variant="secondary" size="sm" onClick={startAdd} className="w-full">
            + Add Server
          </Button>
        ) : (
          <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
            <h4 className="text-sm font-medium text-gray-700">
              {formMode === "add" ? "Add New Server" : `Edit: ${editingProfile?.name}`}
            </h4>

            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Production, Staging"
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Protocol */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Protocol</label>
              <div className="flex gap-2">
                {(["http", "https"] as const).map((proto) => (
                  <button
                    key={proto}
                    type="button"
                    onClick={() => setFormProtocol(proto)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      formProtocol === proto
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {proto.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Server URL */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Server URL</label>
              <input
                type="text"
                value={formServerUrl}
                onChange={(e) => setFormServerUrl(e.target.value)}
                placeholder="opensandbox.example.com:8080"
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* API Key */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">API Key</label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={formApiKey}
                  onChange={(e) => { setFormApiKey(e.target.value); setApiKeyDirty(true); setTestResult(null); }}
                  placeholder="Your OpenSandbox API key"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 pr-14 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-blue-500 hover:text-blue-600 px-1.5 py-0.5"
                >
                  {showApiKey ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* Test result */}
            {testResult && (
              <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
                testResult.connected ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}>
                {testResult.connected ? (
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <span>{testResult.connected ? "Connected successfully" : testResult.error ?? "Connection failed"}</span>
              </div>
            )}

            {/* Form actions */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="secondary"
                size="sm"
                loading={testingConn}
                disabled={!formServerUrl || !formApiKey || testingConn}
                onClick={handleTest}
              >
                Test Connection
              </Button>
              <Button
                size="sm"
                loading={submitting}
                disabled={!isFormValid || submitting}
                onClick={handleSubmit}
              >
                {formMode === "add" ? "Save" : "Update"}
              </Button>
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Allowed Domains */}
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Allowed Domains</h3>
          <p className="text-xs text-gray-500 mb-3">
            Configure domain patterns for sandbox access control. Use <code className="bg-gray-100 px-1 rounded text-[11px]">*.domain.com</code> for wildcard matching.
          </p>

          {domainError && (
            <div className="bg-red-50 text-red-700 text-xs rounded-lg px-3 py-2 mb-2">{domainError}</div>
          )}

          {domainsLoading ? (
            <div className="text-center text-sm text-gray-400 py-3">Loading...</div>
          ) : (
            <div className="space-y-1.5">
              {domains.length === 0 ? (
                <div className="text-center text-sm text-gray-400 py-3">
                  No domains configured
                </div>
              ) : (
                domains.map((domain) => (
                  <div key={domain} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                    domain === activeDomain
                      ? "border-green-300 bg-green-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      {domain === activeDomain ? (
                        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                      )}
                      <span className="text-sm font-mono text-gray-800 truncate">{domain}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {domain !== activeDomain ? (
                        <button
                          onClick={() => activateDomain(domain)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50"
                        >
                          Enable
                        </button>
                      ) : (
                        <span className="text-xs font-medium text-green-600 px-2 py-1">Active</span>
                      )}
                      <button
                        onClick={() => handleRemoveDomain(domain)}
                        className="text-xs text-gray-400 hover:text-red-600 p-0.5 rounded hover:bg-red-50"
                        title="Remove domain"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}

              {/* Add domain input */}
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newDomain}
                  onChange={(e) => { setNewDomain(e.target.value); clearDomainError(); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddDomain(); } }}
                  placeholder="*.example.com"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
                <Button
                  size="sm"
                  disabled={!newDomain.trim() || addingDomain}
                  loading={addingDomain}
                  onClick={handleAddDomain}
                >
                  Add
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
