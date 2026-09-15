import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync("src/lib/public-provider-origin.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
new Function("exports", compiled)(exports);
const { publicHttpsOrigin } = exports;

assert.equal(publicHttpsOrigin("https://localhost:8080"), null);
assert.equal(publicHttpsOrigin("https://127.0.0.1:8080"), null);
assert.equal(publicHttpsOrigin("https://192.168.1.20"), null);
assert.equal(publicHttpsOrigin("http://staging.example.com"), null);
assert.equal(publicHttpsOrigin("https://staging.example.com/home"), null);
assert.equal(publicHttpsOrigin("https://staging.example.com?next=evil"), null);
assert.equal(publicHttpsOrigin("https://staging.example.com/"), "https://staging.example.com");
console.log("Provider return origin checks passed.");
