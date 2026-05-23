import { useState, useEffect } from "react";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { DashboardPage } from "@/pages/DashboardPage";
import { SandboxPage } from "@/pages/SandboxPage";
import { SetupWizardPage } from "@/pages/SetupWizardPage";
import { ImagesPage } from "@/pages/ImagesPage";
import { getHealth } from "@/api/setup";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: "/dashboard",
    element: <DashboardPage />,
  },
  {
    path: "/sandbox/:id",
    element: <SandboxPage />,
  },
  {
    path: "/images",
    element: <ImagesPage />,
  },
  {
    path: "/setup",
    element: <SetupWizardPage />,
  },
]);

type AppState = "checking" | "ready" | "backend-unreachable";

export function App() {
  const [appState, setAppState] = useState<AppState>("checking");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const status = await getHealth();
        if (cancelled) return;

        if (!status.configured) {
          // Never configured — redirect to setup wizard
          if (window.location.pathname !== "/setup") {
            window.location.replace("/setup");
            return;
          }
        }
        // configured: true — go to dashboard regardless of opensandboxReady
        // (port-forward may not be running yet, dashboard will show appropriate state)
        setAppState("ready");
      } catch {
        if (cancelled) return;
        // Backend unreachable — allow /setup to render, show error otherwise
        if (window.location.pathname === "/setup") {
          setAppState("ready");
        } else {
          setAppState("backend-unreachable");
        }
      }
    }

    check();
    return () => { cancelled = true; };
  }, []);

  if (appState === "checking") {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-gray-500">Checking setup status...</p>
        </div>
      </div>
    );
  }

  if (appState === "backend-unreachable") {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Backend Server Not Reachable</h2>
          <p className="text-sm text-gray-500 mb-4">
            Please start the backend server first:
          </p>
          <code className="block bg-gray-100 text-gray-700 text-sm rounded-lg px-4 py-2 font-mono">
            pnpm dev:backend
          </code>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 text-sm text-blue-600 hover:text-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
}
