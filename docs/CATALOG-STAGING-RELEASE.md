# Verified catalog and inventory — staging release

Target **evyssawhlarqqhgyswhz only**. Apply migration `20261020212203_verified_catalog_inventory.sql` before deploying `core-catalog`, `core-catalog-control`, and `core-catalog-sync` (include `_shared/staging.ts`). Frontend must deploy afterward. No production migration or legacy import is authorized by this document.

## Behavior

Existing synthetic fixtures become inactive drafts and are excluded by a restrictive RLS policy. Creation saves an unpublished draft. Product changes invalidate publication, requiring a new documented review. Publication requires name/SKU/description/positive price/category/image, known stock and administrator attestations with evidence for authenticity, eligibility and image rights. Attestations record an accountable human review; the software cannot establish legal eligibility itself. No existing legacy products have been verified or imported.

Numeric inventory is separate from the product's package-size `quantity` text. Unknown stock is null. Available stock is generated from stock on hand minus reserved stock. Constraints reject negative and below-reservation adjustments. Every adjustment/reservation/cancellation writes an immutable ledger event. Mutations and catalog audit events commit together.

Each SKU is a product row, with its package/variant label stored in `quantity`. Grouped variant families and direct image uploads are not implemented; authorized HTTPS image URLs are supported.

`core-catalog-control` actions: `save_product`, `save_category`, `adjust_inventory`, `set_publication`, `history`, and compatibility metadata/hide/archive actions. Existing delete action archives and preserves order references. External sync returns 409: the previous bridge transmitted service credentials to an external Apps Script and has not been carried into staging.

`staging_submit_order(p_items jsonb, p_idempotency_key uuid, p_city text)` accepts item objects `{product_id,quantity,unit_price}`. It requires a confirmed synthetic staging identity and active customer profile, validates authoritative prices/publication/membership, and atomically reserves inventory. Each order is explicitly sandbox; no payment or dispatch occurs. Cities are Las Vegas, North Las Vegas and Henderson. Retry with the same key returns the same order. `staging_cancel_order(p_order_id uuid)` allows the owning customer to release a pending sandbox reservation exactly once. Customer order reads continue through existing ownership RLS. The reservation does not expire automatically; the customer must cancel pending sandbox orders.

## Verification and gates

Run the SQL harness inside `BEGIN; <migration>; <tests/verified_catalog.sql>; ROLLBACK;` before application. It creates only transaction-scoped simulation data and never commits a publication attestation. Then test the deployed HTTP endpoints with the existing synthetic accounts, anonymous callers and customer roles. Check staging project identity and CORS. Confirm no unverified/synthetic products appear in NEXUS.

The migration is additive except that existing staging fixtures are unpublished. Rollback the application to the previous deployment and leave the restrictive publication gate in place. To reverse schema changes after a failed rollout, first stop new ordering and cancel outstanding sandbox reservations; preserve audit/order data and take a database backup. Do not drop ledger or verification data as a routine rollback. Restore prior catalog-read behavior only with explicit review, because it exposes unverified fixtures. Deployments are separately recorded by the release owner.

## Security observations

Live pre-migration advisors identify disabled leaked-password protection and `native_push_devices` with RLS and no policies. The latter is intentional service-only access, not an authorization gap. Keep it inaccessible to clients. Password protection configuration remains an account-level security follow-up; no plan upgrade is authorized.

## Verified transaction rehearsal — October 21, 2026

The full migration plus `supabase/tests/verified_catalog.sql` passed against staging inside a transaction that rolled back. Assertions covered admin draft creation, publication completeness, inventory adjustments/audit, negative-stock rejection, client RLS write rejection, private verification fields, server price checks, reservation 10 → 6, idempotent retry, oversell rollback, cross-customer order/cancellation isolation and idempotent cancellation restoring 10. A follow-up schema query confirmed `publication_status` did not persist. This is a database transaction rehearsal, not a published genuine product or an HTTP/UI end-to-end result. Concurrent multi-session contention is not separately tested.
