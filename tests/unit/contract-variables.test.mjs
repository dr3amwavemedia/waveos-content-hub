import assert from "node:assert/strict";
import test from "node:test";

import {
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

test("flags missing and unsupported placeholders before a draft is saved", () => {
  const values = contractValuesFromJson({ client_name: "Alex" });
  const result = renderContract("{{client_name}} · {{services}} · {{custom_fee}}", values);
  assert.deepEqual(result.missing, ["services"]);
  assert.deepEqual(result.unknown, ["custom_fee"]);
  assert.match(result.content, /{{services}}/);
  assert.equal(contractGuidancePrompts("PAYMENT TERMS\n[Enter the agreed price.]\nFinal text.").length, 1);
});
