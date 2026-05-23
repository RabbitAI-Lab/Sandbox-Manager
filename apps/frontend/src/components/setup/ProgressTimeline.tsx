import { useState } from "react";
import type { SetupProgressEvent } from "@/api/types";

interface ProgressTimelineProps {
  events: SetupProgressEvent[];
  overallProgress: number;
}

export function ProgressTimeline({ events, overallProgress }: ProgressTimelineProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {/* Overall progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${overallProgress}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 text-right">{overallProgress}%</p>

      {/* Step timeline */}
      <div className="space-y-0">
        {events.map((event) => (
          <div key={event.step} className="relative flex gap-3 pb-4">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              {/* Icon */}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  event.status === "success"
                    ? "bg-green-100 text-green-600"
                    : event.status === "error"
                      ? "bg-red-100 text-red-600"
                      : "bg-blue-100 text-blue-600"
                }`}
              >
                {event.status === "success" ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : event.status === "error" ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
              </div>
              {/* Vertical line */}
              <div className="w-px flex-1 bg-gray-200 mt-1" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <p
                className={`text-sm font-medium ${
                  event.status === "success"
                    ? "text-green-700"
                    : event.status === "error"
                      ? "text-red-700"
                      : "text-gray-700"
                }`}
              >
                {event.stepLabel}
              </p>
              {event.output && (
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === event.step ? null : event.step)}
                  className="text-xs text-blue-500 hover:text-blue-600 mt-0.5"
                >
                  {expanded === event.step ? "Hide log" : "View log"}
                </button>
              )}
              {expanded === event.step && event.output && (
                <pre className="mt-1.5 text-xs text-gray-600 bg-gray-50 rounded-lg p-2 max-h-32 overflow-y-auto font-mono whitespace-pre-wrap break-all">
                  {event.output}
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
