import type { ReactNode } from "react";
import { Header } from "./Header";

interface AppShellProps {
  title?: string;
  onBack?: () => void;
  actions?: ReactNode;
  children: ReactNode;
}

export function AppShell({ title, onBack, actions, children }: AppShellProps) {
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Header title={title} onBack={onBack} actions={actions} />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
