import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { SandboxList } from "@/components/sandbox/SandboxList";
import { CreateSandbox } from "@/components/sandbox/CreateSandbox";
import { Button } from "@/components/common/Button";
import { useSandboxStore } from "@/stores/sandboxStore";
import type { CreateSandboxRequest } from "@/api/types";

export function DashboardPage() {
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();
  const { fetchSandboxes, createSandbox } = useSandboxStore();

  useEffect(() => {
    fetchSandboxes();
  }, [fetchSandboxes]);

  const handleCreate = async (opts: { image: string; name: string; timeoutSeconds: number; env?: Record<string, string> }) => {
    const req: CreateSandboxRequest = {
      image: opts.image,
      name: opts.name,
      timeoutSeconds: opts.timeoutSeconds,
      env: opts.env,
    };
    await createSandbox(req);
  };

  return (
    <AppShell
      title="RabbitAI-Lab OpenSandbox"
      configured
      actions={
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => navigate("/images")}>
            Images
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            + Create Sandbox
          </Button>
        </div>
      }
    >
      <div className="p-6 max-w-7xl mx-auto">
        <SandboxList />
      </div>
      <CreateSandbox
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
      />
    </AppShell>
  );
}
