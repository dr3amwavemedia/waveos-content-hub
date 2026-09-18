import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBloomFile,
  detectColumns,
  matchInvoice,
  invoiceUpdate,
} from "../../src/lib/bloom-import.ts";

const CSV = [
  "Invoice Number,Client Name,Email,Amount,Amount Paid,Date,Paid On,Status,Description",
  'Invoice #02026-00010,Rivera Studio,alex@rivera.test,"1,500.00",1500.00,2026-08-01,2026-08-03,Paid,Wedding film',
  "Invoice #02026-00011,Lee Media Group,morgan@lee.test,900.00,0.00,2026-08-05,,Unpaid,Promo",
  "Invoice #02026-00010,Rivera Studio,alex@rivera.test,1500.00,150.00,2026-08-10,2026-08-10,Refund,Partial refund",
];

test("detects Bloom columns without manual mapping", () => {
  const columns = detectColumns(CSV[0].split(","));
  assert.equal(columns.invoiceNumber, "Invoice Number");
  assert.equal(columns.amountPaid, "Amount Paid");
  assert.equal(columns.clientEmail, "Email");
  assert.equal(columns.paidDate, "Paid On");
});

test("reads Bloom transaction export column names", () => {
  const csv = [
    "Invoice Number,Transaction ID,Transaction Type,Transaction DateTime,Transaction Amount,Transaction Status,Currency Code",
    "02026-00053,e2y9wk01895lv,PAYMENT,2026-09-04T18:27:13-04:00,6000.00,COMPLETE,USD",
  ].join("\n");
  const result = parseBloomFile(csv);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].amountCents, 600000);
  assert.equal(result.records[0].sourceId, "payment:e2y9wk01895lv");
});

test("infers payment, invoice and refund rows from one bulk export", () => {
  const { records } = parseBloomFile(CSV.join("\n"));
  assert.deepEqual(
    records.map((record) => record.kind),
    ["payment", "invoice", "refund"],
  );
  assert.equal(records[0].amountCents, 150000);
  assert.equal(records[0].occurredAt.slice(0, 10), "2026-08-03");
  assert.equal(records[2].amountCents, 15000);
});

test("matches rows to the right invoice and never across clients", () => {
  const { records } = parseBloomFile(CSV.join("\n"));
  const invoices = [
    {
      id: "a",
      workspace_id: "w1",
      number: "Invoice #02026-00010",
      amount_cents: 150000,
      amount_paid_cents: 0,
      currency: "USD",
      status: "sent",
      clientName: "Rivera Studio",
      clientEmail: "alex@rivera.test",
    },
    {
      id: "b",
      workspace_id: "w2",
      number: "Invoice #02026-00011",
      amount_cents: 90000,
      amount_paid_cents: 0,
      currency: "USD",
      status: "sent",
      clientName: "Lee Media Group",
      clientEmail: "morgan@lee.test",
    },
  ];
  assert.equal(matchInvoice(records[0], invoices).invoice.id, "a");
  assert.equal(matchInvoice(records[1], invoices).invoice.id, "b");
  assert.equal(matchInvoice(records[0], invoices).reason, "number");
});

test("payments raise the paid amount and never exceed the invoice", () => {
  const invoice = {
    id: "a",
    workspace_id: "w1",
    number: "x",
    amount_cents: 150000,
    amount_paid_cents: 50000,
    currency: "USD",
    status: "sent",
  };
  const patch = invoiceUpdate(invoice, 100000, "2026-08-03T12:00:00.000Z");
  assert.equal(patch.amount_paid_cents, 150000);
  assert.equal(patch.status, "paid");
  assert.equal(patch.paid_at, "2026-08-03T12:00:00.000Z");
  assert.equal(invoiceUpdate({ ...invoice, amount_paid_cents: 150000 }, 5000, "x"), null);
  assert.equal(invoiceUpdate({ ...invoice, status: "void" }, 5000, "x"), null);
});

test("unmatched rows stay unmatched rather than guessing", () => {
  const { records } = parseBloomFile("id,client,amount,date\nA-9,Unknown Co,100.00,2026-08-01\n");
  assert.equal(matchInvoice(records[0], []).invoice, null);
});
