# Pack v3: approval boundary and remaining work

No database changes or publishing were performed. The current implementation uses existing workspace brand fields, reads provider analytics, and keeps trends and refresh diagnostics in browser/session memory only.

## Verified schema state

A direct information_schema query returned no public columns for social_intelligence_profiles, social_intelligence_snapshots, creative_designs, competitors, competitive_reports or workflow_drafts in the connected environment. Earlier claims that these existed are not relied upon. Reconcile the target environment and existing migration history before preparing any migration. Do not rerun the signed-contract migration.

## Proposed additive history definitions — approval required

- social_intelligence_profiles: id UUID primary key; workspace_id UUID unique per provider with provider text; sync_state constrained to pending/success/partial/error; analyzed_sources text[]; requested_range_start/end and available_range_start/end timestamptz; record_count nonnegative integer; last_attempt_at and last_success_at timestamptz; safe_error_code/message text nullable; updated_at timestamptz. No tokens, raw account payloads or private source content.
- social_intelligence_snapshots: id UUID primary key; workspace_id UUID; profile_id referencing the app-owned history profile; metric_key/provider text; availability constrained to available/unavailable/partial; value numeric nullable; unit text; range_start/end timestamptz; record_count nonnegative integer; captured_at timestamptz; source_reference text; calculation_version text; evidence JSONB restricted to source, coverage and calculation details. Index workspace_id/profile_id/captured_at. Unavailable observations have null values, not zero.
- Optional durable trends: workspace_trend_observations with id UUID, workspace_id UUID, saved_by UUID, source_url/title/excerpt text, published_at and observed_at timestamptz, category text, status and licensing text, saved_at timestamptz. Unique workspace/source/category; no popularity score without evidence. Session-only Saved Trends do not currently require this table.
- Optional brand additions: supported heading_font/body_font/accent_font text, secondary logo reference and additional palette roles on the appropriate existing branding record. Current Brand Assist deliberately does not claim unavailable fields were applied.

## Ownership, access and migration sequence

1. Confirm target environment and reconcile existing definitions/migrations; obtain approval for exact SQL and retention.
2. Add only approved app-owned tables/columns with RLS enabled and explicit grants. No references to managed auth tables. History reads require active workspace membership and the existing social entitlement; writes require authenticated, workspace-entitled server operations. Saved trends read/write/delete require active membership and Competitive Intelligence entitlement; identity comes from verified session, not client input.
3. Grant only the minimum authenticated access supported by the policies; no anonymous reads. Test cross-workspace isolation and denied roles before wiring writes.
4. Wire atomic diagnostic/snapshot writes and user-triggered trend saving only after approval. No page-load seeding or inferred historical backfill. Agree retention before enabling unattended cleanup.

Creative design and competitor report durability belong to the separate selective-recovery schema review; do not create those tables as part of this pack without a reconciled specification.

## Remaining limitations

- Real connected external photo thumbnails may load while editing content does not. The tested unavailable photo leaves the original design unchanged; generated sample replacement works, with text/logo/layout/crop retained. Reconnection/source-access troubleshooting remains necessary for that external asset.
- Generated sample photos are explicitly labeled and are not verified property listings or business-owned photos; replace them before client publication.
- Trending Now contains dated public observations, not verified platform virality or licensed audio. Saved observations are session-only. Trend briefs retain their source and require explicit addition when an existing draft is present.
- Current analytics display actual provider values, partial source coverage and explicit refresh outcomes. Paid source returned no ads; unsupported metrics and historical comparisons stay unavailable. Persistent diagnostics/history are not implemented.
- No production release, signatures, charges, emails, destructive operations or migrations are authorized by this completion.