# TODO

## Product Publishing

- Keep product creation simple: when products are created and pushed to the database, they should go live immediately without requiring a separate publish action.
- Availability should control whether a product can be purchased, not whether it appears in the client storefront.

## Later Ideas

- Add a limited-time promotional banner system for seasonal or campaign-based runs.
- Inspiration: Amazon-style occasion promos for events like Easter, Christmas, and Black Friday.
- Desired behavior: a banner that rolls across the screen for active campaigns.
- Not for now; this is planned for a later phase.

## Admin Dashboard

- When the admin dashboard edit-product page is built, add an explicit `Unpublish` action there.
- Product creation should not require a separate publish step; new products should default to published immediately.
- Availability and stock should control whether a product can be bought, while unpublish should be a deliberate admin-only action.

## Security Follow-Up

- Before enabling DPO as a payment provider, patch `lib/payments/providers/dpo.ts` to stop deriving return URLs from `requestOrigin`.
- Required hardening for any future DPO rollout: add explicit `DPO_REDIRECT_URL` and `DPO_BACK_URL` env vars, require them in production, and fail fast if they are missing.
- Treat this as a blocker for turning on `PAYMENT_PROVIDER=dpo`.
