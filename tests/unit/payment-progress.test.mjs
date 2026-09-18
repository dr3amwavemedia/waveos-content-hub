import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const source = readFileSync('src/components/app/payment-progress.tsx', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
const mockedRequire = () => ({
  nextInvoicePaymentCents: ({ amountCents = 0, amountPaidCents = 0, checkoutPaymentType, checkoutPaymentCents = 0 }) =>
    checkoutPaymentType === 'fixed' || (checkoutPaymentType === 'deposit' && amountPaidCents === 0)
      ? Math.min(checkoutPaymentCents, Math.max(0, amountCents - amountPaidCents))
      : Math.max(0, amountCents - amountPaidCents),
});
new Function('exports', 'React', 'require', compiled)(exports, React, mockedRequire);
const base = { amount_cents: 200000, amount_paid_cents: 100000, currency: 'USD', status: 'deposit', payment_plan: 'deposit_balance', billing_month: null, checkout_payment_type: 'remaining', checkout_payment_cents: null };
const render = (changes = {}) => renderToStaticMarkup(React.createElement(exports.PaymentProgress, { invoice: { ...base, ...changes } }));
assert.match(render(), /50% paid/);
assert.match(render(), /\$1,000.00 remaining/);
assert.match(render({ amount_paid_cents: null }), /not been recorded/);
assert.doesNotMatch(render({ amount_paid_cents: null }), /progressbar/);
assert.match(render({ status: 'paid' }), /100% paid/);
assert.match(render({ amount_paid_cents: 0 }), /Awaiting payment/);
assert.match(render({ payment_plan: 'monthly_retainer', billing_month: '2026-09-01' }), /September 2026/);
assert.match(render({ amount_paid_cents: 0, checkout_payment_type: 'deposit', checkout_payment_cents: 50000 }), /\$500.00 due with the next payment/);
assert.equal(render({ status: 'void' }), '');
assert.equal(render({ status: 'draft' }), '');
assert.doesNotMatch(render({ amount_cents: 0, amount_paid_cents: 0 }), /NaN|Infinity/);
console.log('Payment display checks passed: partial, unknown, paid, unpaid, retainer, void, draft, zero.');
