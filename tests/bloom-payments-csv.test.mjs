import test from "node:test";
import assert from "node:assert/strict";
import { parseBloomCsv, dollarsToCents } from "../src/lib/bloom-payments-csv.ts";

test("preserves quoted commas and multiline invoice descriptions", () => {
  const table = parseBloomCsv('id,amount,date,description\r\nA-1,125.50,2026-09-15,"Video, edit\nColor grade"\r\n');
  assert.deepEqual(table.headers, ["id", "amount", "date", "description"]);
  assert.equal(table.rows[0][3], "Video, edit\nColor grade");
  assert.equal(dollarsToCents(table.rows[0][1]), 12550);
});

test("rejects malformed monetary values and inconsistent row widths", () => {
  assert.throws(() => dollarsToCents("12.345"), /Invalid amount/);
  assert.throws(() => parseBloomCsv("id,amount\nA-1,10,extra"), /row width/);
});
