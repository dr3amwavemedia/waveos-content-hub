import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";

const moduleUrl = pathToFileURL(
  new URL("../../src/lib/competitive-scorecard.ts", import.meta.url).pathname,
).href;

test("competitive scorecards keep missing evidence unavailable", async () => {
  const source = await (
    await import("node:fs/promises")
  ).readFile(new URL("../../src/lib/competitive-scorecard.ts", import.meta.url), "utf8");
  assert.match(source, /score: number \| null/);
  assert.match(source, /evidenceCount > 0 && sources\.length > 0/);
  assert.match(source, /Missing categories stay unavailable instead of becoming zero/);
  assert.match(source, /Brand Recognition Signals/);
  assert.match(source, /Conversion Readiness/);
  assert.ok(moduleUrl.includes("competitive-scorecard"));
});

test("competitive scoring is deterministic rather than model-authored", async () => {
  const source = await (
    await import("node:fs/promises")
  ).readFile(new URL("../../src/lib/competitive-scorecard.ts", import.meta.url), "utf8");
  assert.match(source, /strengths\.length \* 8/);
  assert.match(source, /gaps\.length \* 14/);
  assert.match(source, /automationRisks\.length \* 16/);
  assert.match(source, /evidenceCount === 1 \? 55 : evidenceCount === 2 \? 70 : 100/);
  assert.match(source, /eligible\.reduce/);
  assert.match(source, /buildNinetyDayPlan/);
});

test("one positive finding cannot create a high competitive rating", async () => {
  const { scoreResearchReport } = await import(moduleUrl);
  const report = {
    company: "Example",
    industry: null,
    market: null,
    website: null,
    channels: [],
    sections: [
      {
        title: "Social Strategy",
        findings: [
          { text: "The brand has a clear social profile.", sources: ["https://brand.test/post"] },
        ],
      },
    ],
    ideas: [],
    limitations: [],
  };
  const content = scoreResearchReport(report).categories.find(
    (category) => category.key === "content",
  );
  assert.ok(content.score <= 55);
});

test("cited repetitive automation risk lowers social presence", async () => {
  const { scoreResearchReport } = await import(moduleUrl);
  const finding = (text, index) => ({ text, sources: [`https://brand.test/post-${index}`] });
  const base = {
    company: "Example",
    industry: null,
    market: null,
    website: null,
    channels: [],
    ideas: [],
    limitations: [],
  };
  const strong = scoreResearchReport({
    ...base,
    sections: [
      {
        title: "Social Strategy",
        findings: [
          finding("Clear channel purpose is visible.", 1),
          finding("Consistent original content is active.", 2),
          finding("Distinct audience-specific messaging is prominent.", 3),
        ],
      },
    ],
  }).categories.find((category) => category.key === "content");
  const repetitive = scoreResearchReport({
    ...base,
    sections: [
      {
        title: "Social Strategy",
        findings: [
          finding("Clear channel purpose is visible.", 1),
          finding("Consistent original content is active.", 2),
          finding("Distinct audience-specific messaging is prominent.", 3),
          finding("Cited posts show repetitive captions and an automation risk.", 4),
        ],
      },
    ],
  }).categories.find((category) => category.key === "content");
  assert.ok(repetitive.score < strong.score);
  assert.equal(repetitive.automationRisks.length, 1);
});
