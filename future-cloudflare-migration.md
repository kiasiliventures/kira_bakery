# Future Cloudflare Migration

Status: keep this file untracked. Do not commit it until the migration approach is fully confirmed.

## Current assessment

This storefront is not a good first Cloudflare Free target. It is compatible with Cloudflare in principle, but the checkout and custom-request paths are too heavy to treat as a casual migration.

## Migration goal

Keep a Cloudflare path available for the future, but do not migrate this repo until the request hot paths are simplified or the team accepts paid Workers plus careful validation.

## Main risks

1. `app/api/checkout/route.ts` is large and does too much in one request.
2. Custom image/file request flows add more request work.
3. `node:crypto`, `Buffer`, and background-style work appear in critical code paths.
4. Internal maintenance routes already signal Node expectations.

## Implementation plan

### Phase 1: Stabilize the storefront architecture

1. Break the checkout route into smaller helpers.
   - Open `app/api/checkout/route.ts`.
   - Split logic into clear stages:
     - parse request
     - validate request
     - load catalog state
     - build canonical cart
     - create order
     - initiate payment
     - send response
   - Each stage should be a small function.

2. Remove non-essential request work.
   - Identify any analytics, retries, or notifications that are not required before returning success/failure.
   - Move them behind the main response if possible.

3. Review file-heavy request routes.
   - Check custom-request and listing/upload style routes.
   - Avoid image processing during request handling if possible.

4. Audit Node-compat dependencies.
   - List every use of `node:crypto`, `Buffer`, `pg`, and long-running helper code.
   - Decide whether each usage should be:
     - replaced
     - isolated
     - or left for paid Workers only

### Phase 2: Add migration scaffolding after hardening

1. Add OpenNext/Cloudflare adapter.
2. Add `wrangler`.
3. Add Cloudflare config files.
4. Add environment documentation.
5. Keep current Vercel scripts during the transition.

### Phase 3: Run proof-of-concept validation

1. Test home page.
2. Test menu browsing.
3. Test cart and checkout.
4. Test payment initiation.
5. Test custom request upload routes.
6. Check logs for CPU-heavy or compatibility-sensitive routes.

### Phase 4: Decide whether to migrate or defer

1. If preview is clean and the team is comfortable with paid Workers, continue.
2. If request complexity still feels high, keep the repo off Cloudflare until the architecture is simplified further.

## Recommendation

Do not migrate this repo first. Use it as a later, more deliberate Cloudflare project.

## Definition of done

- Checkout route is split and understandable.
- Critical routes have clear request-path boundaries.
- Preview testing passes.
- Team explicitly accepts paid Workers if needed.
