import type { ReactNode } from "react";
import { Header } from "./Header";

interface AppShellProps {
  title?: string;
  onBack?: () => void;
  actions?: ReactNode;
  configured?: boolean;
  children: ReactNode;
}

export function AppShell({ title, onBack, actions, configured, children }: AppShellProps) {
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Header title={title} onBack={onBack} actions={actions} configured={configured} />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
