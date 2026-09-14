import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync("src/lib/production-status.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
new Function("exports", compiled)(exports);
const { saveProductionStatus } = exports;
const project = { id: "project-one", status: "editing" };
const calls = [];
let response = { data: [{ id: project.id }], error: null };
const query = {
  eq(column, value) {
    calls.push(["eq", column, value]);
    return this;
  },
  async select(columns) {
    calls.push(["select", columns]);
    return response;
  },
};
const database = {
  from(table) {
    calls.push(["from", table]);
    return {
      update(values) {
        calls.push(["update", values]);
        return query;
      },
    };
  },
};
await saveProductionStatus(database, project, "complete");
assert.deepEqual(calls, [
  ["from", "production_projects"],
  ["update", { status: "complete" }],
  ["eq", "id", project.id],
  ["eq", "status", "editing"],
  ["select", "id"],
]);
assert.equal(project.status, "editing", "Do not optimistically mutate the stored project");
response = { data: [], error: null };
await assert.rejects(
  saveProductionStatus(database, project, "shooting"),
  /status or your access changed/,
);
response = { data: null, error: null };
await assert.rejects(saveProductionStatus(database, project, "pre_production"), /Reload/);
const failure = new Error("network unavailable");
response = { data: null, error: failure };
await assert.rejects(
  saveProductionStatus(database, project, "complete"),
  (error) => error === failure,
);
console.log(
  "Production status checks passed: scoped save, stale/denied update, network failure, no source mutation.",
);
