import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = readFileSync('src/lib/invitation-contact.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
new Function('exports', compiled)(exports);
const { invitationContact } = exports;

assert.deepEqual(invitationContact(null), { email: '', firstName: '', lastName: '' });
assert.deepEqual(invitationContact({email:' Office@Example.com ',crm_contacts:[]}),
  {email:'office@example.com',firstName:'',lastName:''});
assert.deepEqual(invitationContact({email:'office@example.com',crm_contacts:[
  {first_name:'Other',email:'other@example.com'},
  {first_name:' Ada ',last_name:' Lee ',email:' ADA@Example.com ',is_primary:true},
]}), {email:'ada@example.com',firstName:'Ada',lastName:'Lee'});
assert.deepEqual(invitationContact({email:'office@example.com',crm_contacts:[
  {first_name:'Other',email:'other@example.com'},
  {first_name:'Ada',email:'  ',is_primary:true},
]}), {email:'office@example.com',firstName:'Ada',lastName:''});
assert.equal(invitationContact({crm_contacts:[{email:'first@example.com'}]}).email,'first@example.com');
const original = {email:' ORiginal@Example.com ',crm_contacts:[{first_name:' A '}]};
const before = JSON.stringify(original);
invitationContact(original);
assert.equal(JSON.stringify(original), before, 'Prefilling must never mutate stored CRM data');
console.log('Invitation contact checks passed: primary contact, fallback, missing fields, normalization, no mutation.');
