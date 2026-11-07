export function isIosHomeScreen(navigator: { userAgent: string; platform?: string; maxTouchPoints?: number; standalone?: boolean }, standalone: boolean) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1);
  return ios && (standalone || navigator.standalone === true);
}

// No credentials or unsaved content in handoff URLs; Safari authenticates normally.
export function driveBrowserReturnUrl(origin: string, id: string) {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.username || url.password || !/^[a-zA-Z0-9-]+$/.test(id)) {
    throw new Error("A secure saved-draft link is required.");
  }
  return new URL(`/create?id=${encodeURIComponent(id)}`, url.origin).href;
}

// Saving is explicit and must finish before a continuation link can be exposed.
export async function prepareDriveBrowserReturn(origin: string, save: () => Promise<string | null>) {
  const id = await save();
  if (!id) throw new Error("The draft could not be saved. Stay here and try again.");
  return driveBrowserReturnUrl(origin, id);
}

export function safariOpenUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("A secure WaveOS link is required.");
  return `x-safari-${parsed.href}`;
}

export function drivePickerOutcome(action: string, count: number) {
  if (action === "cancel") return "cancelled";
  if (action === "error") return "failed";
  if (action === "picked") return count > 0 ? "picked" : "empty";
  return "pending";
}

export const driveCheckpointKey = (workspace: string, id: string | null) => `waveos-drive-return-${workspace}-${id ?? "new"}`;