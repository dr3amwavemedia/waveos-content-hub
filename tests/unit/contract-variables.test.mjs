import assert from "node:assert/strict";
import test from "node:test";

import {
  contractFieldsForTemplate,
  contractGuidancePrompts,
  contractValuesFromJson,
  renderContract,
  todayLocalDate,
} from "../../src/lib/contract-variables.ts";

test("fills the selected client's fields and purchased services without changing template wording", () => {
  const template =
    "{{client_name}} of {{business_name}} purchases {{services}} for {{project_name}} on {{project_date}} at {{location}}. Prepared {{today_date}}.";
  const first = {
    client_name: "Alex Rivera",
    business_name: "Rivera Studio",
    services: "Camera coverage — 2 × $275.00",
    project_name: "Fall Campaign",
    project_date: "2026-10-04",
    today_date: todayLocalDate(),
    location: "Sarasota, FL",
  };
  const second = { ...first, client_name: "Morgan Lee", business_name: "Lee Media" };

  const one = renderContract(template, first);
  const two = renderContract(template, second);
  assert.deepEqual(one.missing, []);
  assert.deepEqual(one.unknown, []);
  assert.match(one.content, /Alex Rivera of Rivera Studio purchases Camera coverage/);
  assert.match(one.content, /October 4, 2026/);
  assert.match(two.content, /Morgan Lee of Lee Media/);
  assert.doesNotMatch(two.content, /Alex Rivera/);
  assert.match(template, /{{client_name}}/);
});

test("turns template-specific placeholders into required fill-in fields", () => {
  const values = contractValuesFromJson({ client_name: "Alex" });
  const result = renderContract("{{client_name}} · {{services}} · {{custom_fee}}", values);
  assert.deepEqual(result.missing, ["services", "custom_fee"]);
  assert.deepEqual(result.unknown, []);
  assert.match(result.content, /{{services}}/);
  assert.deepEqual(contractFieldsForTemplate("{{wedding_date}} {{creative_strategy}}"), [
    { key: "wedding_date", label: "Wedding Date", input: "date" },
    { key: "creative_strategy", label: "Creative Strategy", input: "textarea" },
  ]);
  assert.equal(
    contractGuidancePrompts("PAYMENT TERMS\n[Enter the agreed price.]\nFinal text.").length,
    1,
  );
});

test("keeps Dream Wave business variables out of the client contract form", () => {
  const template =
    "{{dwm_logo_url}} {{dwm_street_address}} {{dwm_email}} {{dwm_phone}} {{dwm_website}} {{client_legal_name}} {{project_date}}";
  assert.deepEqual(contractFieldsForTemplate(template), [
    { key: "client_legal_name", label: "Client Legal Name", input: "text" },
    { key: "project_date", label: "Project date", input: "date" },
  ]);

  const result = renderContract(template, {
    dwm_logo_url: "https://example.test/logo.png",
    dwm_street_address: "290 Via Anina Dr, Sarasota, FL 34243",
    dwm_email: "jessehayes@dwmsrq.com",
    dwm_phone: "(941) 294-5727",
    dwm_website: "https://dwmsrq.com",
    client_legal_name: "Sample Client LLC",
    project_date: "2026-10-04",
  });
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.unknown, []);
  assert.doesNotMatch(result.content, /{{dwm_/);
});

test("flags an unsupported Dream Wave variable instead of asking the client form for it", () => {
  assert.deepEqual(contractFieldsForTemplate("{{dwm_unverified_detail}} {{client_name}}"), [
    { key: "client_name", label: "Client name", input: "text" },
  ]);
  const result = renderContract("{{dwm_unverified_detail}}", {});
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.unknown, ["dwm_unverified_detail"]);
});
