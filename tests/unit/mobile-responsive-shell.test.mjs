import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("phone and web dashboards keep distinct responsive identities", () => {
  const home = read("src/routes/_authenticated/home.tsx");
  const styles = read("src/styles.css");

  assert.match(home, /<MobileClassicHome \/>/);
  assert.match(home, /hidden sm:block[\s\S]*<OceanIntelligenceDashboard \/>/);
  assert.match(styles, /@media \(max-width: 639px\)/);
  assert.match(styles, /\.mobile-classic-header/);
  assert.match(styles, /--primary: oklch\(0\.69 0\.2 295\) !important/);
});

test("mobile chrome fits narrow safe-area viewports without covering top controls", () => {
  const shell = read("src/components/app/app-shell.tsx");
  const notifications = read("src/components/app/notifications-bell.tsx");
  const previewBanner = read("src/components/app/impersonation-banner.tsx");
  const studio = read("src/routes/_authenticated/creative-studio.tsx");

  assert.match(shell, /max-w-\[100dvw\]/);
  assert.match(shell, /h-\[calc\(4rem\+env\(safe-area-inset-top\)\)\]/);
  assert.match(shell, /mobile-classic-header sticky top-0 z-30/);
  assert.match(shell, /fixed inset-0 z-50 lg:hidden/);
  assert.match(notifications, /-right-\[3\.25rem\][\s\S]*calc\(100vw-1rem\)/);
  assert.doesNotMatch(previewBanner, /className="sticky top-0 z-30/);
  assert.match(previewBanner, /sm:sticky sm:top-0 sm:z-30/);
  assert.match(studio, /top-\[calc\(4rem\+env\(safe-area-inset-top\)\)\]/);
});

test("saved workspace colors theme both responsive experiences without changing their layouts", () => {
  const shell = read("src/components/app/app-shell.tsx");
  const branding = read("src/hooks/use-workspace-branding.ts");
  const styles = read("src/styles.css");
  const settings = read("src/routes/_authenticated/settings.tsx");

  assert.match(shell, /data-workspace-color-customized=/);
  assert.match(shell, /workspaceThemeStyle\(branding\.data\?\.accentColor\)/);
  assert.match(branding, /hasSavedAccent: typeof data\?\.accent_color === "string"/);
  assert.match(styles, /\.waveos-app-shell:not\(\[data-workspace-color-customized="true"\]\)/);
  assert.match(styles, /color-mix\(in oklab, var\(--primary\) 32%, transparent\)/);
  assert.match(styles, /\.ocean-dashboard[\s\S]*var\(--primary\)/);
  assert.match(settings, /Personalize[\s\S]*color palette on web and mobile/);
  assert.match(settings, /Dashboard[\s\S]*structure, navigation, and features stay unchanged/);
});
