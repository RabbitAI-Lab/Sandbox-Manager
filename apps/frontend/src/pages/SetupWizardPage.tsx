import { useSetupStore } from "@/stores/setupStore";
import { StepIndicator } from "@/components/setup/StepIndicator";
import { K8sModeCard } from "@/components/setup/K8sModeCard";
import { ProgressTimeline } from "@/components/setup/ProgressTimeline";
import { RemoteConnectionForm } from "@/components/setup/RemoteConnectionForm";
import { Button } from "@/components/common/Button";

const WIZARD_STEPS = ["Welcome", "Configure", "Complete"];

function getStepIndex(step: string): number {
  switch (step) {
    case "welcome": return 0;
    case "local-progress":
    case "remote-form": return 1;
    case "complete": return 2;
    default: return 0;
  }
}

export function SetupWizardPage() {
  const { step, k8sMode, progressEvents, overallProgress, error, goToDashboard, reset } = useSetupStore();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">RabbitAI-Lab OpenSandbox</h1>
        <p className="text-sm text-gray-500 mt-1">Kubernetes AI Sandbox Platform</p>
      </div>

      {/* Wizard card */}
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-8">
        {/* Step indicator */}
        <div className="mb-8">
          <StepIndicator steps={WIZARD_STEPS} currentStep={getStepIndex(step)} />
        </div>

        {/* Step content */}
        {step === "welcome" && <WelcomeStep />}
        {step === "local-progress" && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Setting up Local Kubernetes</h2>
            <ProgressTimeline events={progressEvents} overallProgress={overallProgress} />
            {error && (
              <div className="mt-4 bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2.5 flex items-center justify-between">
                <span>{error}</span>
                <Button variant="ghost" size="sm" onClick={reset}>Retry</Button>
              </div>
            )}
          </div>
        )}
        {step === "remote-form" && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Connect to Remote OpenSandbox</h2>
            <RemoteConnectionForm />
          </div>
        )}
        {step === "complete" && <CompleteStep k8sMode={k8sMode} onGoToDashboard={goToDashboard} />}
      </div>
    </div>
  );
}

function WelcomeStep() {
  const { setK8sMode } = useSetupStore();

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Welcome to RabbitAI-Lab OpenSandbox</h2>
      <p className="text-sm text-gray-500 mb-6">
        Choose how to connect to your Kubernetes sandbox environment.
      </p>

      <div className="flex gap-4">
        <K8sModeCard
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          }
          title="Local Docker Kubernetes"
          description="Install and run OpenSandbox on your local Docker Desktop Kubernetes cluster."
          features={["Full automation", "No external server needed", "One-click setup"]}
          onClick={() => setK8sMode("local")}
        />
        <K8sModeCard
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          }
          title="Remote Kubernetes"
          description="Connect to an existing OpenSandbox instance running on a remote server."
          features={["Use existing infrastructure", "Shared team environment", "Custom configuration"]}
          onClick={() => setK8sMode("remote")}
        />
      </div>
    </div>
  );
}

function CompleteStep({ k8sMode, onGoToDashboard }: { k8sMode: "local" | "remote" | null; onGoToDashboard: () => void }) {
  return (
    <div className="text-center py-6">
      {/* Success animation */}
      <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h2 className="text-xl font-semibold text-gray-900 mb-2">Setup Complete!</h2>
      <p className="text-sm text-gray-500 mb-2">
        {k8sMode === "local"
          ? "OpenSandbox has been installed on your local Kubernetes cluster."
          : "Connected to the remote OpenSandbox instance."}
      </p>
      <p className="text-xs text-gray-400 mb-6">
        {k8sMode === "local" ? "Local Kubernetes (localhost:8080)" : "Remote server"}
      </p>

      <Button size="lg" onClick={onGoToDashboard}>
        Go to Dashboard
      </Button>
    </div>
  );
}
