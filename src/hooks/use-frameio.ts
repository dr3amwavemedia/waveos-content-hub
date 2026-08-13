import { supabase } from "@/integrations/supabase/client";

async function frameioRequest<T>(body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("Sign in again to manage Frame.io.");
  const response = await fetch("/api/frameio", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Frame.io request failed.");
  return result;
}

export const getFrameioServiceStatus = () =>
  frameioRequest<{ configured: boolean; connected: boolean; email: string | null }>({ action: "status" });

export const startFrameioServiceConnection = () =>
  frameioRequest<{ url: string }>({ action: "connect" });

export const disconnectFrameioService = () =>
  frameioRequest<{ connected: false }>({ action: "disconnect" });
