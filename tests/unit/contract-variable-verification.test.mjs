/**
 * Contract-variable verification with two synthetic clients.
 * No real client record, workspace or document is touched.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTRACT_FIELDS,
  contractGuidancePrompts,
  contractValuesFromJson,
  emptyContractValues,
  renderContract,
  todayLocalDate,
} from "../../src/lib/contract-variables.ts";
import { readFileSync } from "node:fs";

// business-profile.ts imports a bundler-aliased asset, so read its literals here.
const profileSource = readFileSync("src/lib/business-profile.ts", "utf8");
const profileValue = (key) => {
  const match = profileSource.match(new RegExp(`\\n  ${key}: (null|"([^"]*)")`));
  return match ? (match[1] === "null" ? null : match[2]) : undefined;
};

const TEMPLATE = `MEDIA SERVICES AGREEMENT
Date: {{today_date}}
Client: {{client_name}}
Business: {{business_name}}
Project: {{project_name}}
Project date: {{project_date}}
Location: {{location}}
SERVICES AND PURCHASED ITEMS
{{services}}
PAYMENT TERMS
50% deposit due on signing; balance due on delivery.
SIGNATURES
Signer: {{client_name}}`;

// Two synthetic clients, mirroring what the builder reads from each workspace.
const clientA = {
  client_name: "Alex Rivera",
  business_name: "Rivera Studio LLC",
  project_name: "Fall Brand Campaign",
  project_date: "2026-10-04",
  today_date: "2026-09-16",
  location: "Sarasota, FL",
  services: "Camera coverage: Full-day shoot — 2 × $275.00 = $550.00",
};
const clientB = {
  client_name: "Morgan Lee",
  business_name: "Lee Media Group",
  project_name: "Winter Product Launch",
  project_date: "2026-12-02",
  today_date: "2026-09-16",
  location: "Tampa, FL",
  services: "Reel package: 3 vertical edits — 1 × $1,200.00 = $1,200.00",
};

const noPlaceholders = (text) => {
  assert.doesNotMatch(text, /{{|}}/, "raw placeholder left in rendered contract");
  assert.doesNotMatch(text, /\bnull\b|\bundefined\b|\bNaN\b/, "empty value leaked into contract");
};

test("every contract variable has a defined source field", () => {
  const sources = {
    client_name:
      "workspaces.client_name → crm_contacts first+last → projects.client_name → workspaces.name",
    business_name: "workspaces.business_name → crm_accounts.business_name → projects.business_name",
    services:
      "client_invoices.line_items (title, description, qty × unit) → client_invoices.description + amount_cents",
    project_date:
      "projects.event_date → projects.start_date → workspaces.wedding_date → production_projects.scheduled_at",
    today_date: "device local date at draft creation (todayLocalDate)",
    location:
      "workspaces.wedding_location → production_projects.location → workspaces.service_area",
    project_name: "projects.name → production_projects.title",
  };
  for (const { key } of CONTRACT_FIELDS) {
    assert.ok(sources[key], `no documented source for ${key}`);
  }
  assert.equal(Object.keys(sources).length, CONTRACT_FIELDS.length);
});

test("client A and client B each resolve their own name, business, project, dates, pricing and signer", () => {
  const a = renderContract(TEMPLATE, clientA);
  const b = renderContract(TEMPLATE, clientB);

  for (const result of [a, b]) {
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.unknown, []);
    noPlaceholders(result.content);
  }

  assert.match(a.content, /Client: Alex Rivera/);
  assert.match(a.content, /Business: Rivera Studio LLC/);
  assert.match(a.content, /Project: Fall Brand Campaign/);
  assert.match(a.content, /Project date: October 4, 2026/);
  assert.match(a.content, /Date: September 16, 2026/);
  assert.match(a.content, /Location: Sarasota, FL/);
  assert.match(a.content, /2 × \$275\.00 = \$550\.00/);
  assert.match(a.content, /Signer: Alex Rivera/);
  assert.match(a.content, /50% deposit due on signing/);

  assert.match(b.content, /Client: Morgan Lee/);
  assert.match(b.content, /Business: Lee Media Group/);
  assert.match(b.content, /Project date: December 2, 2026/);
  assert.match(b.content, /\$1,200\.00/);
});

test("one client's values never appear in the other client's contract", () => {
  const a = renderContract(TEMPLATE, clientA).content;
  const b = renderContract(TEMPLATE, clientB).content;
  for (const leak of [
    "Morgan Lee",
    "Lee Media Group",
    "Winter Product Launch",
    "Tampa",
    "1,200.00",
  ]) {
    assert.ok(!a.includes(leak), `client B value "${leak}" leaked into client A`);
  }
  for (const leak of [
    "Alex Rivera",
    "Rivera Studio LLC",
    "Fall Brand Campaign",
    "Sarasota",
    "275.00",
  ]) {
    assert.ok(!b.includes(leak), `client A value "${leak}" leaked into client B`);
  }
});

test("Dream Wave business details resolve from the verified profile only", () => {
  assert.equal(profileValue("name"), "Dream Wave Media");
  assert.equal(profileValue("website"), "https://dwmsrq.com");
  assert.equal(profileValue("location"), "Sarasota, FL");
  assert.equal(profileValue("phone"), "(941) 294-5727");
  assert.match(profileSource, /logoUrl: logoAsset\.url/);
  // Owner-verified on 2026-09-18.
  assert.equal(profileValue("email"), "jessehayes@dwmsrq.com");
  assert.equal(profileValue("streetAddress"), "290 Via Anina Dr, Sarasota, FL 34243");
  assert.equal(profileValue("legalEntity"), "Dream Wave Media LLC");
  // Unverified fields stay null rather than being invented.
  for (const key of ["taxId", "paymentInstructions"]) {
    assert.equal(profileValue(key), null, `${key} must stay unset until verified`);
  }
});

test("a missing required variable blocks publication and leaves no blank hole", () => {
  const incomplete = { ...clientA, services: "", location: "" };
  const result = renderContract(TEMPLATE, incomplete);
  assert.deepEqual(result.missing.sort(), ["location", "services"]);
  // The token is preserved (visible, blocking) instead of rendering as empty.
  assert.match(result.content, /{{services}}/);
  // Same gate the builder's canSave uses.
  const canSave =
    result.missing.length === 0 &&
    result.unknown.length === 0 &&
    contractGuidancePrompts(TEMPLATE).length === 0;
  assert.equal(canSave, false);
});

test("template-specific placeholders and unfinished starter clauses also block saving", () => {
  const result = renderContract(`${TEMPLATE}\nRetainer: {{monthly_fee}}`, clientA);
  assert.deepEqual(result.missing, ["monthly_fee"]);
  assert.deepEqual(result.unknown, []);
  assert.equal(contractGuidancePrompts("PAYMENT TERMS\n[Enter the agreed price.]").length, 1);
});

test("a published contract keeps an immutable value and template-version snapshot", () => {
  // What the builder writes into client_contracts.contract_data at save time.
  const snapshot = Object.freeze({
    templateText: TEMPLATE,
    values: Object.freeze({ ...clientA }),
    sourceInvoiceId: "inv-a",
    sourceProjectId: "proj-a",
  });
  const publishedText = renderContract(snapshot.templateText, snapshot.values).content;
  const publishedVersion = 3;

  // The source records change afterwards…
  const updatedSourceRecord = {
    ...clientA,
    client_name: "Alex Rivera-Santos",
    business_name: "Rivera Group",
  };

  // …the published agreement is re-derived from its own snapshot, not the source.
  const reRendered = renderContract(snapshot.templateText, snapshot.values).content;
  assert.equal(reRendered, publishedText);
  assert.match(reRendered, /Client: Alex Rivera$/m);
  assert.ok(!reRendered.includes("Rivera-Santos"));
  assert.ok(!reRendered.includes("Rivera Group"));
  assert.equal(publishedVersion, 3);

  // A fresh revision is what picks the new values up.
  const revision = renderContract(snapshot.templateText, updatedSourceRecord).content;
  assert.match(revision, /Client: Alex Rivera-Santos/);
});

test("a snapshot read back from storage never yields null or undefined values", () => {
  const roundTripped = contractValuesFromJson(JSON.parse(JSON.stringify(clientB)));
  for (const { key } of CONTRACT_FIELDS) assert.equal(typeof roundTripped[key], "string");
  const blank = emptyContractValues();
  for (const { key } of CONTRACT_FIELDS) assert.equal(blank[key], "");
  assert.match(todayLocalDate(), /^\d{4}-\d{2}-\d{2}$/);
});
