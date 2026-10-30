import { supabase } from "@/integrations/supabase/client";

let installed = false;
const recent = new Map<string, number>();
const DEDUP_MS = 10_000;

async function logError(payload: {
  message: string;
  stack?: string;
  severity?: "error" | "warning" | "critical";
}) {
  try {
    const key = `${payload.message}::${(payload.stack || "").slice(0, 200)}`;
    const now = Date.now();
    const last = recent.get(key) || 0;
    if (now - last < DEDUP_MS) return;
    recent.set(key, now);

    // Trim map to avoid unbounded growth
    if (recent.size > 100) {
      const cutoff = now - DEDUP_MS;
      for (const [k, t] of recent) if (t < cutoff) recent.delete(k);
    }

    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;

    await supabase.from("error_logs").insert({
      error_message: (payload.message || "Unknown error").slice(0, 2000),
      error_stack: payload.stack ? payload.stack.slice(0, 8000) : null,
      page_url: typeof window !== "undefined" ? window.location.href : null,
      user_id: userId,
      severity: payload.severity ?? "error",
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  } catch {
    // swallow — never let the logger itself throw
  }
}

export function installGlobalErrorLogger() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    logError({
      message: event.message || String(event.error),
      stack: event.error?.stack,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason: any = event.reason;
    logError({
      message:
        typeof reason === "string"
          ? reason
          : reason?.message || "Unhandled promise rejection",
      stack: reason?.stack,
    });
  });
}

export const errorLogger = { logError };
