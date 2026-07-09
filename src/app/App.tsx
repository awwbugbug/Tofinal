import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { AppShell } from "@/components/layout/AppShell";

export default function App() {
  return (
    <AppErrorBoundary>
      <AppShell />
    </AppErrorBoundary>
  );
}
