import { useState } from "react";
import { useSetupStore } from "@/stores/setupStore";
import { Button } from "@/components/common/Button";

export function RemoteConnectionForm() {
  const {
    remoteForm,
    updateRemoteForm,
    testRemoteConnection,
    submitRemoteConfig,
    testing,
    testResult,
    submitting,
    error,
  } = useSetupStore();

  const [showApiKey, setShowApiKey] = useState(false);
  const canSubmit = testResult?.connected && !submitting;

  return (
    <div className="space-y-5">
      {/* Protocol */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Protocol</label>
        <div className="flex gap-2">
          {(["http", "https"] as const).map((proto) => (
            <button
              key={proto}
              type="button"
              onClick={() => updateRemoteForm("protocol", proto)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                remoteForm.protocol === proto
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
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Server URL</label>
        <input
          type="text"
          value={remoteForm.serverUrl}
          onChange={(e) => updateRemoteForm("serverUrl", e.target.value)}
          placeholder="opensandbox.example.com:8080"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        />
      </div>

      {/* API Key */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">API Key</label>
        <div className="relative">
          <input
            type={showApiKey ? "text" : "password"}
            value={remoteForm.apiKey}
            onChange={(e) => updateRemoteForm("apiKey", e.target.value)}
            placeholder="Your OpenSandbox API key"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-16 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-500 hover:text-blue-600 px-2 py-1"
          >
            {showApiKey ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {/* Test connection result */}
      {testResult && (
        <div
          className={`flex items-center gap-2 text-sm rounded-lg px-4 py-2.5 ${
            testResult.connected
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {testResult.connected ? (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span>{testResult.connected ? "Connected successfully" : testResult.error ?? "Connection failed"}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2.5">{error}</div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          variant="secondary"
          loading={testing}
          disabled={!remoteForm.serverUrl || !remoteForm.apiKey || testing}
          onClick={testRemoteConnection}
        >
          Test Connection
        </Button>
        <Button
          loading={submitting}
          disabled={!canSubmit}
          onClick={submitRemoteConfig}
        >
          Save & Connect
        </Button>
      </div>
    </div>
  );
}
