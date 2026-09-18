import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  paymentReceiptEmail,
  signedContractEmail,
} from "../../src/lib/document-completion-email.ts";
import { contractFieldsForTemplate } from "../../src/lib/contract-variables.ts";
import { invoiceDiscount } from "../../src/lib/invoice-discount.ts";

test("payment receipt email includes the received, paid, and remaining amounts", () => {
  const copy = paymentReceiptEmail({
    invoiceNumber: "INV-2026-100",
    receivedCents: 50000,
    totalPaidCents: 50000,
    balanceCents: 95018,
    currency: "USD",
  });
  assert.equal(copy.eventType, "payment_receipt");
  assert.match(copy.message, /\$500\.00/);
  assert.match(copy.message, /\$950\.18/);
  assert.equal(copy.portalHash, "invoices");
});

test("signed-contract email directs the client to the secure contract section", () => {
  const copy = signedContractEmail({ contractTitle: "Photography Services Agreement" });
  assert.equal(copy.eventType, "signed_contract_copy");
  assert.match(copy.subject, /Photography Services Agreement/);
  assert.equal(copy.portalHash, "contracts");
});

test("photography agreement exposes client and shoot details but hides Dream Wave fields", () => {
  const migration = readFileSync(
    "supabase/migrations/20260918131126_add_photography_services_contract.sql",
    "utf8",
  );
  const content = migration.match(/\$contract\$([\s\S]*?)\$contract\$/)?.[1] ?? "";
  assert.deepEqual(contractFieldsForTemplate(content), [
    { key: "today_date", label: "Today's date", input: "date" },
    { key: "client_legal_name", label: "Client Legal Name", input: "text" },
    { key: "client_business_name", label: "Client Business Name", input: "text" },
    { key: "shoot_date", label: "Shoot Date", input: "date" },
    { key: "shoot_location", label: "Shoot Location", input: "text" },
    { key: "scheduled_time", label: "Scheduled Time", input: "text" },
    { key: "signer_name", label: "Signer Name", input: "text" },
    { key: "signer_title", label: "Signer Title", input: "text" },
    { key: "signer_email", label: "Signer Email", input: "text" },
  ]);
  assert.match(content, /Total Project Cost: \$1,450\.18/);
  assert.match(content, /\{\{dwm_signer_name\}\}, \{\{dwm_signer_title\}\}/);
});

test("webhooks trigger completion email delivery only after verified provider events", () => {
  const stripe = readFileSync("src/routes/api/public/hooks/stripe.ts", "utf8");
  const recorder = readFileSync("src/lib/stripe-invoice-payment.server.ts", "utf8");
  const signwell = readFileSync("src/routes/api/public/hooks/signwell.ts", "utf8");
  assert.match(stripe, /String\(object\.payment_status \?\? ""\) !== "paid"/);
  assert.match(stripe, /applyStripeCheckoutPayment/);
  assert.match(recorder, /sendPaymentReceiptEmail/);
  assert.match(signwell, /eventType === "document_completed"/);
  assert.match(signwell, /sendSignedContractCopyEmail/);
});

test("Stripe return confirmation records deposits immediately and refreshes portal invoices", () => {
  const paymentServer = readFileSync("src/lib/payments.functions.ts", "utf8");
  const paymentReturn = readFileSync("src/routes/_authenticated/payment-return.tsx", "utf8");
  const recorder = readFileSync("src/lib/stripe-invoice-payment.server.ts", "utf8");
  assert.match(paymentServer, /checkout\/sessions\/\$\{encodeURIComponent\(data\.sessionId\)\}/);
  assert.match(paymentServer, /applyStripeCheckoutPayment/);
  assert.match(recorder, /status: settled \? "paid" : "deposit"/);
  assert.match(recorder, /provider_session_id: null/);
  assert.match(paymentReturn, /Payment processed/);
  assert.match(paymentReturn, /Payment declined/);
  assert.match(paymentReturn, /invalidateQueries\(\{ queryKey: \["layer1", "invoices"\] \}\)/);
  assert.doesNotMatch(paymentReturn, /We're waiting for your bank/);
});

test("portal provides authenticated record copies without relying on external hosted links", () => {
  const portal = readFileSync("src/components/app/layer1-overview.tsx", "utf8");
  assert.match(portal, /ClientInvoiceCopyButton/);
  assert.match(portal, /ClientContractCopyButton/);
  assert.match(portal, /SignedContractPdfButton/);
});

test("invoice discounts calculate fixed and percentage totals in cents", () => {
  assert.deepEqual(invoiceDiscount({ subtotalCents: 145018, type: "fixed", value: 50 }), {
    subtotalCents: 145018,
    discountCents: 5000,
    totalCents: 140018,
    discountType: "fixed",
    discountValue: 5000,
  });
  assert.deepEqual(invoiceDiscount({ subtotalCents: 145018, type: "percentage", value: 10 }), {
    subtotalCents: 145018,
    discountCents: 14502,
    totalCents: 130516,
    discountType: "percentage",
    discountValue: 1000,
  });
});

test("signed-contract archive remains private and is exposed only by a short-lived URL", () => {
  const migration = readFileSync(
    "supabase/migrations/20260918131200_contract_signature_archive.sql",
    "utf8",
  );
  const server = readFileSync("src/lib/contracts.functions.ts", "utf8");
  assert.match(migration, /'contract-archive', 'contract-archive', false/);
  assert.match(migration, /REVOKE ALL.*anon, authenticated/);
  assert.match(server, /getSignedContractArchiveLink/);
  assert.match(server, /signedArchiveUrl/);
});
