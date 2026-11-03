export function usesDirectSupabaseOAuth(origin: string) {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname.endsWith(".workers.dev");
  } catch {
    return false;
  }
}
