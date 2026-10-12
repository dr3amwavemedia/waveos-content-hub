import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function walk(directory) {
  const files = [];
  for (const name of await readdir(new URL(directory, root))) {
    const relative = path.posix.join(directory, name);
    const details = await stat(new URL(relative, root));
    if (details.isDirectory()) files.push(...(await walk(relative)));
    else if (/\.[tj]sx?$/.test(name)) files.push(relative);
  }
  return files;
}

const publicRoute = (routeId) => routeId.replace(/^\/_authenticated(?=\/|$)/, "") || "/";

test("every static internal navigation destination resolves to an application route", async () => {
  const routeFiles = await walk("src/routes");
  const sourceFiles = await walk("src");
  const routeIds = new Set();

  for (const file of routeFiles) {
    const source = await readFile(new URL(file, root), "utf8");
    for (const match of source.matchAll(/createFileRoute\("([^"]+)"\)/g)) {
      routeIds.add(publicRoute(match[1]));
    }
  }

  const references = new Map();
  const destinationPattern = /(?:\bto\s*[:=]|\b(?:assign|replace)\s*\()\s*["'`]([^"'`]+)["'`]/g;
  for (const file of sourceFiles) {
    const source = await readFile(new URL(file, root), "utf8");
    for (const match of source.matchAll(destinationPattern)) {
      const destination = match[1];
      if (
        !destination.startsWith("/") ||
        destination.startsWith("//") ||
        destination.includes("${")
      )
        continue;
      const pathname = destination.split(/[?#]/, 1)[0];
      if (!references.has(pathname)) references.set(pathname, []);
      references.get(pathname).push(file);
    }
  }

  const missing = [...references]
    .filter(([pathname]) => !routeIds.has(pathname))
    .map(([pathname, files]) => `${pathname} (${[...new Set(files)].join(", ")})`);
  assert.deepEqual(missing, [], `Unknown internal destinations:\n${missing.join("\n")}`);
});

test("authentication and payment providers return through dedicated WaveOS routes", async () => {
  const [auth, authCallback, subscriptions, invoices, contracts, frameio, outlook] =
    await Promise.all([
      readFile(new URL("src/routes/auth.tsx", root), "utf8"),
      readFile(new URL("src/routes/auth-callback.tsx", root), "utf8"),
      readFile(new URL("src/lib/social-subscriptions.functions.ts", root), "utf8"),
      readFile(new URL("src/lib/payments.functions.ts", root), "utf8"),
      readFile(new URL("src/lib/contracts.functions.ts", root), "utf8"),
      readFile(new URL("src/lib/frameio.server.ts", root), "utf8"),
      readFile(new URL("src/lib/outlook.server.ts", root), "utf8"),
    ]);

  assert.match(auth, /redirect_uri: `\$\{window\.location\.origin\}\/auth-callback/);
  assert.match(authCallback, /safeNext/);
  assert.match(subscriptions, /success_url: `\$\{origin\}\/settings\?subscription=started/);
  assert.match(subscriptions, /return_url: `\$\{origin\}\/settings\?billing=updated`/);
  assert.match(invoices, /\/payment-return\?invoice=/);
  assert.match(contracts, /\/contract-return\?contract=/);
  assert.match(frameio, /new URL\(externalMediaEnv\("WAVEOS_APP_URL"\)\)\.origin/);
  assert.match(outlook, /new URL\(outlookEnv\("WAVEOS_APP_URL"\)\)\.origin/);
});
