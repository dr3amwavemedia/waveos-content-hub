# Bloom client portal comparison

Reviewed September 23, 2026 against Bloom's current public product and help documentation.

## Recommended WaveOS behavior

| Client-portal capability       | Bloom behavior                                                                                                                 | WaveOS status / direction                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branded client login           | Clients receive an invite and log in with the email attached to the project.                                                   | Present: private invites, workspace membership, branding, and staff preview.                                                                                                |
| Project dashboard              | Clients see their projects, project information, and relevant actions.                                                         | Present. Mobile should prioritize current actions and move historical records into Settings.                                                                                |
| Invoices and payments          | The business enables payment options before sending; the client opens one payment page and chooses an available method/option. | Updated locally: one `Pay invoice` action offers the scheduled deposit/installment or the full remaining balance.                                                           |
| Deposit                        | Admin enables it, sets the amount and final due date, and chooses manual or automatic collection for the balance.              | Amount and manual/automatic collection exist. A separate final-balance due-date field remains a useful follow-up.                                                           |
| Installments / custom payments | Bloom supports payment plans and custom payments selected on the invoice.                                                      | Fixed installments are supported. Admin presentation is now an On/Off option with a custom amount.                                                                          |
| Autopay                        | Stripe/Square can save authorization and charge later.                                                                         | Present through Stripe authorization and scheduled charges. Admin now gets a clear On/Off control.                                                                          |
| Pay in full                    | Available as an invoice payment choice when a partial plan is offered.                                                         | Updated locally: always available and cannot be removed by clients.                                                                                                         |
| Fees                           | Bloom can add a credit-card surcharge.                                                                                         | WaveOS supports an invoice-level service fee. It is included in the displayed invoice and checkout amounts. It is not currently conditional by payment method.              |
| Payment tracking               | Processor payments update the project automatically; manual methods must be recorded manually.                                 | Stripe payments reconcile automatically. Manual payment recording is available through the admin invoice value, but a dedicated `Record payment` workflow would be clearer. |
| Invoice/receipt access         | Clients can view/pay/download invoices in the portal or use emailed links.                                                     | Present. Settings now contains categorized invoices and printable WaveOS receipts. Legacy hosted links remain available when recorded.                                      |
| Contracts                      | Clients can sign contracts, including contracts connected to invoices.                                                         | Present through SignWell and archived signed PDFs. Invoice-gated contract signing is not yet a single combined flow.                                                        |
| Galleries and assets           | Clients can view/download galleries and upload/download shared assets; visibility can be controlled.                           | Deliveries and Frame.io-curated media are present. Client upload to shared assets and per-item visibility controls are partial gaps.                                        |
| Messaging                      | Portal includes a primary message action and can add a secondary CTA.                                                          | Request Something is present. Configurable secondary CTA/referral widgets are gaps.                                                                                         |
| Welcome experience             | Configurable cover art and a first-login welcome message.                                                                      | Workspace branding exists. The guide is now client-only and persisted once per account; custom cover art/welcome copy is partial.                                           |
| Mobile experience              | Clean portal experience with key actions easy to reach.                                                                        | Updated locally with a reduced phone menu, reduced admin client tabs, larger tap targets, and desktop-only maintenance tools.                                               |

## Important provider distinction

- SignWell is the contract-signing and certified signed-PDF provider.
- Stripe is the card payment processor.
- An old Stripe Checkout URL is not a durable receipt and may expire. WaveOS should treat its verified payment record as the durable receipt, with a Stripe receipt URL added later only if it is explicitly stored from the successful charge.
- A legacy Bloom or other hosted invoice URL can remain as an “original payment link,” but it should not be labeled a Stripe receipt unless WaveOS has verified that it is one.

## Sources

- https://help.bloom.io/en/articles/5334121-how-do-client-portals-work
- https://help.bloom.io/en/articles/8599598-configure-your-client-portal-settings
- https://help.bloom.io/en/articles/5147285-creating-and-sending-an-invoice
- https://help.bloom.io/en/articles/4612845-paying-for-an-invoice-via-client-portal
- https://help.bloom.io/en/articles/14189535-setting-up-payment-methods
- https://help.bloom.io/en/articles/6002073-uploading-files-to-shared-assets
