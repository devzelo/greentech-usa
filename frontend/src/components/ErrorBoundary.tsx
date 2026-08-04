import { Component, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Catches render-time errors so a single broken component shows a readable
 * message instead of blanking the whole app. (Class cast to `any` for member
 * access because this project has no @types/react installed.)
 */
export default class ErrorBoundary extends (Component as any) {
  constructor(props: Props) {
    super(props);
    (this as any).state = { error: null } as State;
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("App crashed:", error, info);
  }

  render() {
    const self = this as any;
    const error: Error | null = self.state?.error || null;
    if (error) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", fontFamily: "system-ui, sans-serif", background: "#f8fafc" }}>
          <div style={{ maxWidth: 720, width: "100%", background: "#fff", border: "1px solid #fee2e2", borderRadius: "1.5rem", padding: "2rem", boxShadow: "0 10px 40px rgba(0,0,0,0.08)" }}>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#b91c1c", marginBottom: "0.5rem" }}>Something broke on this screen</h1>
            <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "1rem" }}>The rest of the app still works — use your browser Back button. Error detail:</p>
            <pre style={{ background: "#0f172a", color: "#fca5a5", padding: "1rem", borderRadius: "0.75rem", fontSize: "0.75rem", overflow: "auto", maxHeight: 320, whiteSpace: "pre-wrap" }}>
              {error.message}
              {"\n\n"}
              {error.stack}
            </pre>
            <button
              onClick={() => { window.location.href = "/dashboard"; }}
              style={{ marginTop: "1.25rem", padding: "0.6rem 1.5rem", background: "#0f172a", color: "#fff", border: 0, borderRadius: "0.75rem", fontWeight: 700, fontSize: "0.8rem", cursor: "pointer" }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return self.props.children;
  }
}
