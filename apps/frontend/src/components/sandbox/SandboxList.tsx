import { SandboxCard } from "./SandboxCard";
import { useSandboxStore } from "@/stores/sandboxStore";
import type { Sandbox } from "@/api/types";

export function SandboxList() {
  const { sandboxes, loading, deleteSandbox, pauseSandbox, resumeSandbox } = useSandboxStore();

  if (loading && sandboxes.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />
            <div className="h-4 bg-gray-100 rounded w-1/2 mb-4" />
            <div className="flex gap-2">
              <div className="h-8 bg-gray-100 rounded w-20" />
              <div className="h-8 bg-gray-100 rounded w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (sandboxes.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-gray-400 mb-3">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>
        <p className="text-gray-500 text-lg">No sandboxes yet</p>
        <p className="text-gray-400 text-sm mt-1">Create your first sandbox to get started</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {sandboxes.map((sb: Sandbox) => (
        <SandboxCard
          key={sb.id}
          sandbox={sb}
          onDelete={deleteSandbox}
          onPause={pauseSandbox}
          onResume={resumeSandbox}
        />
      ))}
    </div>
  );
}
