import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const server = fs.readFileSync("src/lib/frameio.server.ts", "utf8");
const deliveries = fs.readFileSync("src/routes/_authenticated/deliveries.tsx", "utf8");

test("Frame.io delivery follows every cursor page and rejects unsafe next links", () => {
  assert.match(server, /result\.links\?\.next/);
  assert.match(server, /frameio_pagination_loop/);
  assert.match(server, /url\.origin !== "https:\/\/api\.frame\.io"/);
  assert.match(server, /page_size: "100"/);
});

test("Frame.io delivery traverses folders and version stacks", () => {
  assert.match(server, /type: "folder" \| "version_stack"/);
  assert.match(server, /segment = container\.type === "folder" \? "folders" : "version_stacks"/);
  assert.match(server, /collect\(children, container\.path\)/);
  assert.match(server, /folderPath/);
});

test("Frame.io no longer drops valid files through a four-format allowlist", () => {
  assert.doesNotMatch(server, /\["image\/jpeg", "image\/png", "video\/mp4", "video\/quicktime"\]/);
  assert.match(server, /entry\.type !== "file"/);
  assert.match(deliveries, /Complete Frame\.io delivery/);
  assert.match(deliveries, /file\.folderPath\.join\(" \/ "\)/);
});
