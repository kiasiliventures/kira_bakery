# PLATFORM AUDIT REPORT REVISED

Audit date: 2026-04-07

Repos audited:
- `C:\Users\Jurugo\OneDrive\VS Code\Web Development\kira_bakery` storefront/PWA
- `C:\Users\Jurugo\OneDrive\VS Code\Web Development\kira-bakery-admin` admin dashboard
- Shared Supabase/Postgres/Auth/Storage/Realtime/payment/push flows

Important scope notes:
- PostHog is not integrated in the current codebase.
- Linear is not integrated in the current codebase.
- Any observability or issue-routing recommendation below is future work, not current platform behavior.

## 1. Executive Summary

Overall assessment: **not production-ready**.

Some previously reported issues were genuinely fixed. I confirmed:
- checkout now normalizes duplicate cart lines before stock validation and idempotency hashing
- guest order access now supports signed access links instead of relying only on a short-lived cookie
- same-origin protection exists on browser mutation routes
- cross-repo internal routes now use short-lived signed request tokens
- storefront service worker no longer caches checkout/payment/account/order HTML as generic shell content
- the payment lifecycle trigger has now been attached in production so verified payment_status transitions are no longer expected to drift from authoritative order lifecycle state
- storefront rate limiting now uses the shared Supabase-backed limiter instead of a per-process in-memory map

However, the current platform still has serious launch blockers in the payment and operations path:
- pending-payment recovery is now storefront-driven instead of dashboard-driven, but still relies on organic server traffic rather than a durable scheduler during total idle periods
- payment reconciliation is still not durably autonomous
- both push-notification retry systems now have no-cron opportunistic drain paths, but still rely on organic traffic during total idle periods
- storefront customer ready-push delivery now sends with explicit TTL/urgency/topic hints instead of relying on bare web-push defaults
- storefront now records operational incidents for key payment and push failure modes, and the admin app now exposes an admin-only incidents page with basic status actions, but there is still no outbound alert channel

## 2. Public-Facing Readiness Verdict

**NO**

Exact blockers preventing launch:
- There is still no outbound alert channel for operational incidents.

## 3. Critical Blockers

### 3.1 Payment lifecycle mismatch after settlement

Status: **Fixed in production after this audit**

Previous severity: **Critical**

Original evidence:
- Lifecycle function exists in [supabase/migrations/202603290002_paid_inventory_deduction_review_state.sql](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/supabase/migrations/202603290002_paid_inventory_deduction_review_state.sql#L129)
- Updated lifecycle function exists again in [supabase/migrations/202604020001_recover_settled_orders_from_false_cancellation.sql](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/supabase/migrations/202604020001_recover_settled_orders_from_false_cancellation.sql#L1)
- Only `orders_set_updated_at` was attached to `public.orders` in [supabase/migrations/20260304_initial_bakery_schema.sql](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/supabase/migrations/20260304_initial_bakery_schema.sql#L105)
- Payment verification persists `payment_status`, `paid_at`, and payment metadata in [lib/payments/order-payments.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/payments/order-payments.ts#L717)
- Admin UI derives "Paid" from `payment_status` in [src/lib/order-display-state.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/order-display-state.ts#L44)
- Admin transition RPC requires `existing_order.status = 'Paid'` before Ready in [supabase/migrations/202603290002_paid_inventory_deduction_review_state.sql](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/supabase/migrations/202603290002_paid_inventory_deduction_review_state.sql#L419)

Fix applied:
- Trigger attached in [supabase/migrations/202604070002_attach_order_payment_lifecycle_trigger.sql](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/supabase/migrations/202604070002_attach_order_payment_lifecycle_trigger.sql)
- Payment verification path now also promotes lifecycle state on paid transitions in [lib/payments/order-payments.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/payments/order-payments.ts#L450) and [lib/payments/order-payments.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/payments/order-payments.ts#L717)
- Regression coverage was added in [tests/payment-sync.test.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/tests/payment-sync.test.ts)

Updated assessment:
- This is no longer treated as an active launch blocker if production has the trigger migration applied and the updated storefront code deployed.
- Residual risk is now low and mostly regression/deployment-related rather than a known live logic gap.

### 3.2 Generic payment initiation failure can strand an order in a blocked retry shell

Status: **Fixed in storefront code after this audit**

Previous severity: **Critical**

Evidence:
- Initiation claim writes `payment_initiation_attempted_at` in [lib/payments/order-payments.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/payments/order-payments.ts#L355)
- Retry is blocked by `PAYMENT_INITIATION_PENDING_VERIFICATION_ERROR` while the claim lease is still fresh in [lib/payments/order-payments.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/payments/order-payments.ts#L931)
- Checkout generic failure path returns `500` in [app/api/checkout/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/checkout/route.ts#L1012)
- Explicit Pesapal rejections with no tracking id and no redirect URL are cancelled immediately in [app/api/checkout/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/checkout/route.ts#L945) and [lib/payments/order-payments.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/payments/order-payments.ts#L1442)

Fix applied:
- `payment_initiation_attempted_at` now behaves as a short lease instead of a permanent lock in [lib/payments/order-payments.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/payments/order-payments.ts#L184)
- Stale claims are released when there is still no tracking id and no redirect URL in [lib/payments/order-payments.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/payments/order-payments.ts#L383) and [lib/payments/order-payments.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/payments/order-payments.ts#L930)
- Regression coverage was added for stale-claim recovery in [tests/payment-sync.test.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/tests/payment-sync.test.ts)

Updated assessment:
- This is no longer treated as an active launch blocker if the updated storefront code is deployed.
- Current behavior is intentionally simple: no automatic retry loop, immediate cancellation for explicit Pesapal rejection, and manual retry allowed after a 90-second stale-claim lease expires.
- A retry counter could still be added later as a hardening improvement, but the permanent blocked-retry failure mode has been removed.

### 3.3 Pending-payment recovery no longer depends on the dashboard, but is still opportunistic during idle periods

Status: **Partially fixed after this audit**

Current severity: **High**

Previous severity: **Critical**

Evidence:
- Storefront only schedules cake-image cleanup in [vercel.json](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/vercel.json#L1)
- Admin has no scheduled jobs in [vercel.json](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/vercel.json#L1)
- Admin dashboard auto-runs reconcile every 5 minutes in [src/components/admin/dashboard-recent-orders.tsx](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/components/admin/dashboard-recent-orders.tsx#L31) and [src/components/admin/dashboard-recent-orders.tsx](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/components/admin/dashboard-recent-orders.tsx#L144)
- Reconcile logic only scans recent tracked pending orders with caps in [src/lib/payments/reverify.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/payments/reverify.ts#L13) and [src/lib/payments/reverify.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/payments/reverify.ts#L356)
- Storefront now has its own opportunistic reconcile engine in [lib/payments/order-payments.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/payments/order-payments.ts#L1490)
- Storefront traffic now schedules post-response reconcile attempts from [app/api/checkout/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/checkout/route.ts#L691), [app/api/payments/pesapal/callback/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/payments/pesapal/callback/route.ts#L53), [app/api/payments/pesapal/ipn/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/payments/pesapal/ipn/route.ts#L100), [app/api/payments/pesapal/status/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/payments/pesapal/status/route.ts#L90), and [app/api/orders/[id]/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/orders/[id]/route.ts#L60)

Updated assessment:
- Recovery no longer depends on an open admin dashboard tab.
- Recent tracked pending orders can now be reverified and softly cancelled from ordinary storefront/payment traffic.
- This is a meaningful resilience improvement and removes the previous browser-ops dependency.

Residual risk:
- If the platform is totally idle after a payment event, there is still no durable wake-up at the 15-minute mark.
- In low-traffic periods, a due pending order can wait until the next organic request hits the storefront.

Fix direction:
- Current no-external-scheduler design is acceptable if traffic is expected regularly.
- If low-traffic idle windows become a real production problem, add a durable delayed job or a very infrequent backstop sweep later.

### 3.4 Push retry queues no longer depend on cron, but are still opportunistic during idle periods

Status: **Partially fixed after this audit**

Current severity: **Medium**

Previous severity: **High**

Evidence, storefront ready notifications:
- Queue retry logic exists in [lib/push/order-ready.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/push/order-ready.ts#L272)
- Due-scan processor exists in [lib/push/order-ready.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/push/order-ready.ts#L453)
- Cron-style route exists in [app/api/internal/push/order-ready/process/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/internal/push/order-ready/process/route.ts#L92)
- Storefront now opportunistically drains due ready-push retries from ordinary traffic in [lib/push/order-ready.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/push/order-ready.ts) and the storefront routes patched during this audit
- Storefront first-attempt sends now include explicit delivery hints in [lib/push/web-push.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/push/web-push.ts) and regression coverage in [tests/web-push.test.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/tests/web-push.test.ts)

Evidence, admin paid-order push:
- Enqueue trigger exists in [supabase/migrations/202604070001_admin_push_notifications.sql](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/supabase/migrations/202604070001_admin_push_notifications.sql#L60)
- Retry logic exists in [src/lib/push/admin-paid-order-notifications.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/push/admin-paid-order-notifications.ts#L387)
- Processing route exists in [src/app/api/internal/push/admin-paid-orders/process/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/api/internal/push/admin-paid-orders/process/route.ts#L17)
- Admin API traffic now opportunistically drains due paid-order push retries through [src/lib/push/admin-paid-order-notifications.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/push/admin-paid-order-notifications.ts) and [src/lib/http/admin-route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/http/admin-route.ts)

Updated assessment:
- Both customer and admin push systems can now retry without Vercel cron.
- This removes the previous “queued forever unless manually processed” shape from both retry paths.
- The storefront immediate customer push path is stronger now because order-ready sends no longer rely on default web-push transport settings.
- Customer notification enrollment remains intentionally opt-in. Expanding or forcing subscription prompts earlier in the order journey is deferred by product choice, not treated as a current launch blocker.

Residual risk:
- If the platform is completely idle after a retryable push failure, the next retry still waits for organic storefront or admin traffic.
- This is a deliberate no-cron tradeoff rather than a queue correctness bug.

Fix direction:
- Current no-cron design is acceptable if regular traffic exists on both surfaces.
- If idle-period delivery latency becomes a real issue later, add a delayed job or very infrequent backstop runner rather than frequent cron.

## 4. Security Findings

### 4.1 Storefront rate limiting now uses the shared backend limiter

Status: **Fixed in storefront code after this audit**

Previous severity: **High**

Evidence:
- Shared limiter table and RPC already existed in [supabase/migrations/202603180005_shared_rate_limit_store.sql](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/supabase/migrations/202603180005_shared_rate_limit_store.sql)
- Storefront limiter now calls `consume_rate_limit` through the service-role client in [lib/rate-limit.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/rate-limit.ts)
- Focused regression coverage exists in [tests/rate-limit.test.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/tests/rate-limit.test.ts)

Updated assessment:
- Storefront rate limiting is no longer process-local.
- This closes the previous Vercel multi-instance bypass concern for the routes that use [lib/rate-limit.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/rate-limit.ts).

### 4.2 Storefront service-role helper remains too easy to misuse

Severity: **Medium**

Evidence:
- [lib/supabase/server.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/supabase/server.ts#L27) exposes the service-role client as `getSupabaseServerClient()`

Impact:
- Future routes can accidentally bypass RLS while appearing to use a normal server client.

Fix direction:
- Rename it to make privilege level explicit and separate auth-scoped helpers from service-role helpers.

### 4.3 Storefront cake upload validation still trusts file metadata

Severity: **Medium**

Evidence:
- Validation only checks name/type/size in [lib/cake-reference-images.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/cake-reference-images.ts#L57)
- Upload route relies on that validation in [app/api/cakes/custom-request/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/cakes/custom-request/route.ts#L119)

Impact:
- The storefront path remains a weaker upload surface than the admin image upload path.

Fix direction:
- Reuse magic-byte validation or a shared file-signature sniffing utility.

### 4.4 CSP is still looser than ideal

Severity: **Low**

Evidence:
- Storefront CSP in [next.config.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/next.config.ts#L28)
- Admin CSP in [src/next.config.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/next.config.ts#L13)

Impact:
- Inline script allowance is broader than ideal for a hardened public deployment.

Fix direction:
- Tighten CSP over time, especially around inline script execution.

### 4.5 Auth and boundary handling that look good in current code

Evidence:
- Same-origin mutation validation in [lib/http/same-origin.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/http/same-origin.ts#L28)
- Guest/signed order access handling in [app/api/orders/[id]/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/orders/[id]/route.ts#L41)
- Internal route signing in [lib/internal-auth.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/internal-auth.ts#L126) and [src/lib/internal-auth.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/internal-auth.ts#L113)
- Admin route wrapper in [src/lib/http/admin-route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/http/admin-route.ts#L15)

Assessment:
- These are meaningful improvements versus earlier audit risk areas.

## 5. Performance Findings

### 5.1 Admin orders page still loads a heavy nested 100-order query

Severity: **High**

Evidence:
- Heavy selection in [src/lib/supabase/queries.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/supabase/queries.ts#L73)
- Default limit `100` in [src/lib/supabase/queries.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/supabase/queries.ts#L261)
- Used directly by [src/app/(admin)/orders/page.tsx](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/(admin)/orders/page.tsx#L6)

Impact:
- This will get expensive as orders grow and is a bad default for slower devices and weak networks.

Fix direction:
- Paginate the list and split summary queries from detail queries.

### 5.2 Admin realtime fallback becomes full refresh polling

Severity: **Medium**

Evidence:
- Fallback interval in [src/lib/orders-realtime.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/orders-realtime.ts#L8)
- Fallback triggers refresh behavior in [src/components/admin/use-orders-realtime.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/components/admin/use-orders-realtime.ts#L51)

Impact:
- Realtime disconnects degrade into repeated full refresh work, which is costly on weak networks and low-end hardware.

Fix direction:
- Narrow fallback refresh scope and avoid whole-screen refreshes where possible.

### 5.3 Catalog freshness is stale for too long

Severity: **Medium**

Evidence:
- `CATALOG_REVALIDATE_SECONDS = 600` in [lib/catalog/products.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/catalog/products.ts#L24)

Impact:
- Customers can see stale availability/publishing state and only learn the truth at checkout.

Fix direction:
- Reduce revalidate time or add better invalidation for product changes.

### 5.4 Storefront cake uploads still buffer entire files in memory

Severity: **Medium**

Evidence:
- `request.formData()` in [app/api/cakes/custom-request/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/cakes/custom-request/route.ts#L97)
- `Buffer.from(await file.arrayBuffer())` in [app/api/cakes/custom-request/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/cakes/custom-request/route.ts#L42)

Impact:
- This can amplify memory pressure under abuse or bursts.

Fix direction:
- Move to a stricter upload path with streaming or more defensive file handling.

## 6. Reliability Findings

### 6.1 Browser redirect trust is not the main problem anymore

Assessment:
- The system does not blindly trust the browser redirect.
- Callback/IPN paths call provider verification through backend authority paths.

Evidence:
- [app/api/payments/pesapal/callback/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/payments/pesapal/callback/route.ts#L53)
- [app/api/payments/pesapal/ipn/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/payments/pesapal/ipn/route.ts#L117)
- [app/api/internal/payments/orders/[id]/verify/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/internal/payments/orders/[id]/verify/route.ts#L39)

Remaining issue:
- Recovery after missed provider signals is still too dependent on opportunistic traffic.

### 6.2 Admin display state can diverge from backend transition truth

Severity: **High**

Evidence:
- Admin display derivation in [src/lib/order-display-state.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/order-display-state.ts#L44)
- Transition RPC requirements in [supabase/migrations/202603290002_paid_inventory_deduction_review_state.sql](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/supabase/migrations/202603290002_paid_inventory_deduction_review_state.sql#L419)

Impact:
- Staff can be shown a paid state that still fails when they try to advance the order operationally.

### 6.3 Customer ready notifications now have no-cron retry draining, but still depend on organic traffic during idle periods

Severity: **Medium**

Evidence:
- Enqueue path in [app/api/internal/push/orders/[id]/ready/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/internal/push/orders/[id]/ready/route.ts#L110)
- Retry and due processing in [lib/push/order-ready.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/push/order-ready.ts#L344) and [lib/push/order-ready.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/push/order-ready.ts#L453)
- Ordinary storefront traffic now opportunistically drains due retries through [lib/push/order-ready.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/push/order-ready.ts)
- Failed permanent customer push dispatches now create operational incidents through [lib/ops/incidents.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/ops/incidents.ts)

Impact:
- Retryable sends no longer depend on cron or manual queue draining.
- During total idle periods, a due retry can still wait for the next organic storefront request.

### 6.4 Admin paid-order notifications still have idle-period retry latency and incomplete incident visibility

Severity: **Medium**

Evidence:
- Triggered enqueue in [supabase/migrations/202604070001_admin_push_notifications.sql](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/supabase/migrations/202604070001_admin_push_notifications.sql#L60)
- Retry logic in [src/lib/push/admin-paid-order-notifications.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/push/admin-paid-order-notifications.ts#L387)
- Admin API traffic now opportunistically drains due retries in [src/lib/push/admin-paid-order-notifications.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/push/admin-paid-order-notifications.ts)

Impact:
- Retryable admin push sends no longer require cron, but they still wait for organic admin traffic during idle periods.
- This repo now records storefront-side incident data, but equivalent admin incident capture/review still needs follow-through in the admin repo.

## 7. Operational / Deployment Findings

### 7.1 Observability is improved, but still lacks active alert delivery and an ops review surface

Severity: **High**

Evidence:
- Storefront only includes Vercel analytics/speed insights in [app/layout.tsx](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/layout.tsx#L121)
- Admin only includes speed insights in [src/app/layout.tsx](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/layout.tsx#L49)
- Storefront now has a DB-backed incident writer in [lib/ops/incidents.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/ops/incidents.ts) and schema in [supabase/migrations/202604070003_ops_incidents.sql](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/supabase/migrations/202604070003_ops_incidents.sql)
- Key storefront payment and push failure paths now report incidents from [app/api/payments/pesapal/callback/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/payments/pesapal/callback/route.ts), [app/api/payments/pesapal/ipn/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/payments/pesapal/ipn/route.ts), [lib/payments/order-payments.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/payments/order-payments.ts), and [lib/push/order-ready.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/push/order-ready.ts)
- Incidents are now visible in an admin-only dashboard page at [incidents/page.tsx](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/(admin)/incidents/page.tsx), with `Resolve`, `Ignore`, and `Reopen` actions through [status route](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/api/admin/incidents/[id]/status/route.ts), and read/update access restricted to `admin` in [202604070003_ops_incidents.sql](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/supabase/migrations/202604070003_ops_incidents.sql)

Impact:
- Storefront payment and customer-push failures are now durably recorded instead of living only in transient logs.
- Admins can now review incidents in the dashboard and manage basic status, but there is still no outbound alert delivery.

Fix direction:
- Add outbound alert delivery on top of the new admin incidents page.
- Add equivalent incident capture for admin-side push failures in the admin repo.
- Stronger error tracking remains future work and is not currently implemented through PostHog or Linear.

### 7.2 Admin audit coverage is still incomplete

Severity: **Medium**

Evidence:
- Good coverage on order mutation routes:
  - [src/app/api/admin/orders/[id]/status/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/api/admin/orders/[id]/status/route.ts#L78)
  - [src/app/api/admin/orders/[id]/reverify-payment/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/api/admin/orders/[id]/reverify-payment/route.ts#L96)
- Missing on major admin mutations:
  - [src/app/api/admin/products/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/api/admin/products/route.ts#L14)
  - [src/app/api/admin/products/[id]/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/api/admin/products/[id]/route.ts#L9)
  - [src/app/api/admin/variants/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/api/admin/variants/route.ts#L8)
  - [src/app/api/admin/users/[id]/role/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/api/admin/users/[id]/role/route.ts#L8)

Impact:
- Role changes and catalog mutations are less reconstructable during incidents.

## 8. Fast Wins

- Add audit logging to all high-value admin mutation routes.

## 9. Required Fixes Before Public Launch

- Add outbound alert delivery or incident status actions on top of the new admin incidents page.

## 10. Recommended Fixes After Launch

- Rename the storefront service-role helper to make privilege level explicit.
- Strengthen storefront cake upload validation with file-signature checks.
- Reduce admin orders overfetching and add pagination/split detail loading.
- Tighten CSP over time.
- Add stronger observability tooling as future work.
- Mirror the new incident capture pattern into the admin repo for admin push failures.

## 11. File-by-File Evidence

### Storefront
- [app/api/checkout/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/checkout/route.ts)
- [app/api/orders/[id]/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/orders/[id]/route.ts)
- [app/api/payments/pesapal/callback/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/payments/pesapal/callback/route.ts)
- [app/api/payments/pesapal/ipn/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/payments/pesapal/ipn/route.ts)
- [app/api/payments/pesapal/status/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/payments/pesapal/status/route.ts)
- [app/api/internal/payments/orders/[id]/verify/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/internal/payments/orders/[id]/verify/route.ts)
- [app/api/push/subscribe/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/push/subscribe/route.ts)
- [app/api/internal/push/orders/[id]/ready/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/internal/push/orders/[id]/ready/route.ts)
- [app/api/internal/push/order-ready/process/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/internal/push/order-ready/process/route.ts)
- [app/api/cakes/custom-request/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/app/api/cakes/custom-request/route.ts)
- [lib/payments/order-payments.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/payments/order-payments.ts)
- [lib/payments/providers/pesapal.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/payments/providers/pesapal.ts)
- [lib/push/order-ready.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/push/order-ready.ts)
- [lib/push/admin-paid-order.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/push/admin-paid-order.ts)
- [lib/rate-limit.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/rate-limit.ts)
- [lib/supabase/server.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/supabase/server.ts)
- [lib/http/same-origin.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/http/same-origin.ts)
- [lib/cake-reference-images.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/cake-reference-images.ts)
- [lib/catalog/products.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/lib/catalog/products.ts)
- [public/sw.js](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/public/sw.js)
- [next.config.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/next.config.ts)
- [vercel.json](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/vercel.json)

### Admin
- [src/app/api/admin/orders/[id]/status/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/api/admin/orders/[id]/status/route.ts)
- [src/app/api/admin/orders/[id]/reverify-payment/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/api/admin/orders/[id]/reverify-payment/route.ts)
- [src/app/api/admin/orders/reconcile-pending-payments/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/api/admin/orders/reconcile-pending-payments/route.ts)
- [src/app/api/admin/products/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/api/admin/products/route.ts)
- [src/app/api/admin/products/[id]/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/api/admin/products/[id]/route.ts)
- [src/app/api/admin/variants/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/api/admin/variants/route.ts)
- [src/app/api/admin/users/[id]/role/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/api/admin/users/[id]/role/route.ts)
- [src/app/api/internal/push/admin-paid-orders/process/route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/app/api/internal/push/admin-paid-orders/process/route.ts)
- [src/lib/payments/reverify.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/payments/reverify.ts)
- [src/lib/push/admin-paid-order-notifications.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/push/admin-paid-order-notifications.ts)
- [src/lib/order-display-state.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/order-display-state.ts)
- [src/lib/orders.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/orders.ts)
- [src/lib/supabase/queries.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/supabase/queries.ts)
- [src/components/admin/dashboard-recent-orders.tsx](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/components/admin/dashboard-recent-orders.tsx)
- [src/components/admin/order-status-manager.tsx](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/components/admin/order-status-manager.tsx)
- [src/components/admin/use-orders-realtime.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/components/admin/use-orders-realtime.ts)
- [src/lib/orders-realtime.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/orders-realtime.ts)
- [src/lib/http/admin-route.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/http/admin-route.ts)
- [src/lib/security/rate-limit.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/src/lib/security/rate-limit.ts)
- [next.config.ts](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/next.config.ts)
- [vercel.json](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/vercel.json)

### Shared DB / Migrations
- [supabase/migrations/20260304_initial_bakery_schema.sql](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/supabase/migrations/20260304_initial_bakery_schema.sql)
- [supabase/migrations/202603250002_harden_checkout_and_customer_order_reads.sql](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/supabase/migrations/202603250002_harden_checkout_and_customer_order_reads.sql)
- [supabase/migrations/202603280001_push_ready_notifications.sql](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/supabase/migrations/202603280001_push_ready_notifications.sql)
- [supabase/migrations/202604040001_durable_push_ready_queue.sql](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/supabase/migrations/202604040001_durable_push_ready_queue.sql)
- [supabase/migrations/202603290002_paid_inventory_deduction_review_state.sql](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/supabase/migrations/202603290002_paid_inventory_deduction_review_state.sql)
- [supabase/migrations/202604020001_recover_settled_orders_from_false_cancellation.sql](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira_bakery/supabase/migrations/202604020001_recover_settled_orders_from_false_cancellation.sql)
- [supabase/migrations/202604070001_admin_push_notifications.sql](C:/Users/Jurugo/OneDrive/VS%20Code/Web%20Development/kira-bakery-admin/supabase/migrations/202604070001_admin_push_notifications.sql)

## Verification Notes

Tests run:
- Storefront tests passed: `95`
- Admin tests passed: `7`

Build verification limits in this environment:
- Storefront build was blocked by external Google Fonts fetch during `next/font/google` resolution.
- Admin build compiled but failed later in this environment with `spawn EPERM`.

These environment-specific build limits do not change the launch blockers above.


