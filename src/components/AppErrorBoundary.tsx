import { Component, type ErrorInfo, type ReactNode } from "react";

import { usePreferencesStore } from "@/stores/preferencesStore";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

const copy = {
  "zh-CN": {
    title: "界面遇到问题",
    body: "应用界面出现了一个错误，你的任务数据是安全的。重新加载即可回到普通窗口模式。",
    reload: "重新加载",
  },
  "en-US": {
    title: "Something went wrong",
    body: "The interface hit an error. Your tasks are safe — reloading returns you to normal window mode.",
    reload: "Reload",
  },
} as const;

/**
 * Catches render crashes so a thrown error shows a recoverable fallback
 * instead of a blank/black screen. `mode` is not persisted, so reloading always
 * comes back in normal window mode — the escape hatch from a pin-mode crash.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the crash for diagnostics without taking the window down.
    console.error("AppErrorBoundary caught a render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    let language: keyof typeof copy = "zh-CN";
    try {
      const stored = usePreferencesStore.getState().language;
      if (stored === "en-US" || stored === "zh-CN") {
        language = stored;
      }
    } catch {
      // Fall back to the default copy if the store is unavailable.
    }
    const text = copy[language];

    return (
      <div className="app-shell-bg flex h-screen flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">{text.title}</h1>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">{text.body}</p>
        </div>
        <button
          className="rounded-full border border-[var(--border-soft)] bg-[var(--accent-surface)] px-5 py-2 text-sm font-medium text-[var(--accent-hover)] transition-opacity hover:opacity-90"
          onClick={() => window.location.reload()}
          type="button"
        >
          {text.reload}
        </button>
      </div>
    );
  }
}
