# Performance Audit Report

Date: 2026-03-17
Last Updated: 2026-03-18
Project: KiRA Bakery PWA
Scope: Customer-facing performance, client/runtime behavior, rush-hour reliability, data-fetching patterns, payment/status load behavior

## Executive Summary

This audit reviews what is most likely to slow down, fail, or amplify load under peak customer traffic. The most serious issue is that the storefront relies heavily on uncached live reads for core browsing flows, which turns normal user traffic into repeated database work. The second major issue is that several client views have weak failure handling, so transient backend trouble can make the storefront appear empty or stuck.

The app is structurally clean enough to harden, but it currently behaves more like a thin live database client than a storefront optimized for high-read traffic.

## Priority Findings

### P0 - Catalog browsing is built on repeated uncached live reads

Severity: Critical
Status: Done on 2026-03-18

The home page, menu catalog, and product-detail flow repeatedly depend on fresh live reads from Supabase or internal API routes instead of cached or pre-rendered catalog data.

Impact under rush hour:

- High read amplification against Supabase
- Slower first loads for menu/product pages
- More sensitivity to transient database latency
- Avoidable pressure on app server and database at the same time

Evidence:

- `app/page.tsx` fetches category imagery from live product rows
- `components/menu-catalog.tsx` loads products client-side on mount
- `repositories/supabase-product-repository.ts` uses `cache: "no-store"` for list and detail requests
- `app/api/products/route.ts` re-queries the full product set on every request
- `app/api/products/[id]/route.ts` re-queries product detail on every request

Recommended fix:

- Move the menu catalog to server rendering with caching or revalidation
- Add `revalidate` or equivalent caching for product list/detail routes
- Cache category image selection instead of deriving it from a full live scan every request
- Treat catalog data as high-read, low-write and optimize for that pattern

### P1 - Menu and product pages degrade badly when product fetches fail or slow down

Severity: High
Status: Done on 2026-03-18

The menu and product-detail components do not handle repository failures gracefully. The repository throws on bad responses, but the components do not catch errors and do not provide a resilient fallback UI.

Impact under rush hour:

- Empty or broken-looking storefront during partial outages
- Users retry aggressively, increasing load further
- Poor recovery experience on mobile networks

Evidence:

- `components/menu-catalog.tsx`
- `components/product-detail-view.tsx`
- `repositories/supabase-product-repository.ts`

Recommended fix:

- Catch async load failures in catalog/detail views
- Render loading, retry, and failure states explicitly
- Add stale-last-known-good behavior for product lists where appropriate

### P1 - Price presentation is inconsistent with server-side checkout pricing for variant-backed products

Severity: High
Status: Done on 2026-03-18

Legacy-admin variant products are flattened to a single display price on the client, while checkout re-prices based on the selected variant on the server. This is not just a UX defect; it causes conversion friction and support load under peak traffic.

Impact under rush hour:

- Checkout abandonment when totals change unexpectedly
- Increased customer support noise
- Harder reconciliation between displayed subtotal and charged total

Evidence:

- `lib/supabase/mappers.ts`
- `components/product-card.tsx`
- `components/product-detail-view.tsx`
- `components/checkout-form.tsx`
- `app/api/checkout/route.ts`

Recommended fix:

- Model variant pricing explicitly in the client product type
- Show price ranges or selected-variant prices in the UI
- Keep cart subtotal aligned with the eventual server-charged amount

### P2 - Payment result checks can amplify external provider traffic

Severity: Medium
Status: Done on 2026-03-18

The payment-result flow always requests fresh status, and the backend will perform live provider verification while the order is still unpaid. A cluster of customers repeatedly refreshing the result page can generate unnecessary payment-provider calls.

Impact under rush hour:

- Extra load against payment provider APIs
- Extra database churn during a high-conversion period
- Increased latency for users checking payment state

Evidence:

- `components/payment-result-view.tsx`
- `app/api/payments/pesapal/status/route.ts`
- `lib/payments/order-payments.ts`

Recommended fix:

- Add short-lived status caching or debounce logic
- Poll with a bounded interval instead of full page reloads
- Avoid fresh provider verification on every status request
- Prefer database state first, provider refresh second

### P2 - PWA offline behavior is much weaker than the product messaging suggests

Severity: Medium
Status: Done on 2026-03-18

The service worker precaches a minimal set of routes, skips API caching entirely, and does not make catalog pages reliably available offline. The offline page messaging suggests stronger resilience than the runtime actually provides.

Impact under rush hour:

- Weak resilience on flaky mobile networks
- More broken navigation when connectivity degrades
- Lower trust in the app-install/PWA experience

Evidence:

- `public/sw.js`
- `components/pwa-register.tsx`
- `app/offline/page.tsx`

Recommended fix:

- Cache stable catalog routes intentionally
- Add versioned runtime caching strategies for product media and route shells
- Align offline messaging with actual capabilities until the SW is strengthened

### P3 - Build reliability depends on third-party font fetches at build time

Severity: Low
Status: Done on 2026-03-18

The production build currently depends on fetching Google Fonts during `next build`. In environments with restricted egress or flaky connectivity, builds can fail even when the application code is otherwise valid.

Impact:

- Build pipeline fragility
- Slower or failed deploys in restricted environments

Evidence:

- `app/layout.tsx`
- Local build failure occurred when `next/font/google` could not fetch `Inter` and `Playfair Display`

Recommended fix:

- Vendor fonts locally or ensure build environments have reliable egress
- Treat font fetch dependencies as part of deployment hardening

## Hardening Plan

### Phase 1 - Remove the biggest load amplifiers

Target: same week

Status: Done on 2026-03-18

1. [Done] Add caching or revalidation to the product list and product detail paths
2. [Done] Move menu/catalog data loading to the server where possible
3. [Done] Stop using `cache: "no-store"` for all catalog reads by default
4. [Done] Cache the home-page category imagery selection

### Phase 2 - Make failures survivable

Target: same week

Status: Done on 2026-03-18

1. [Done] Add explicit loading, empty, error, and retry states for menu and product detail
2. [Done] Add graceful degradation when product APIs are slow or unavailable
3. [Done] Add stale-last-known-good fallback for catalog browsing

### Phase 3 - Align money flows with what users see

Target: 1 to 2 weeks

Status: Done on 2026-03-18

1. [Done] Represent variant pricing properly on the client
2. [Done] Ensure cart subtotal reflects the selected variant price
3. [Done] Prevent silent total changes between product page, cart, and checkout

### Phase 4 - Reduce payment-status load

Target: 1 to 2 weeks

Status: Done on 2026-03-18

1. [Done] Replace refresh-based status checks with controlled polling
2. [Done] Add short TTL caching for unpaid payment status reads
3. [Done] Avoid live provider verification on every request unless strictly needed for pending payments

### Phase 5 - Strengthen the PWA experience

Target: backlog

Status: Done on 2026-03-18

1. [Done] Add deliberate offline caching for key browse routes
2. [Done] Cache route shells and static product media
3. [Done] Rework offline messaging so it matches actual behavior

## Suggested Next Actions

Recommended order of work:

1. No open audit items remain. Continue with normal product work and revisit performance after major storefront changes.

## Source References

- `app/page.tsx`
- `app/api/products/route.ts`
- `app/api/products/[id]/route.ts`
- `components/menu-catalog.tsx`
- `components/product-detail-view.tsx`
- `repositories/supabase-product-repository.ts`
- `components/product-card.tsx`
- `components/checkout-form.tsx`
- `app/api/checkout/route.ts`
- `components/payment-result-view.tsx`
- `app/api/payments/pesapal/status/route.ts`
- `lib/payments/order-payments.ts`
- `public/sw.js`
- `components/pwa-register.tsx`
- `app/offline/page.tsx`
- `app/layout.tsx`
