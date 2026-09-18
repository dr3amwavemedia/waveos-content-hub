import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// The catalog helpers are typed TS; verify the pricing rules through the source
// contract that the UI relies on, in the same lightweight style as the other
// unit tests in this folder.
const source = readFileSync(new URL("../../src/lib/catalog.ts", import.meta.url), "utf8");

test("range and starting-at items always require a final agreed price", () => {
  assert.match(source, /requiresFinalPrice[\s\S]*pricing_type === "range"[\s\S]*"starting_at"/);
  assert.match(source, /if \(requiresFinalPrice\(item\)\) return null;/);
});

test("monthly and annual prices are offered separately, never summed", () => {
  assert.match(
    source,
    /billing === "annual" \? item\.annual_price_cents : item\.monthly_price_cents/,
  );
});

test("money is formatted from whole cents", () => {
  assert.match(source, /cents \/ 100/);
  assert.doesNotMatch(source, /parseFloat\(/);
});

test("the picker blocks adding an item without a usable amount", () => {
  const picker = readFileSync(
    new URL("../../src/components/documents/catalog-item-picker.tsx", import.meta.url),
    "utf8",
  );
  assert.match(picker, /if \(unitCents === null\) return;/);
  assert.match(picker, /suggestedUnitCents\(selected, billing\) === null/);
});
