# KiRA Bakery PWA (Local Dev Mode)

Production-structured bakery Progressive Web App built with:

- Next.js 16 (App Router)
- TypeScript (strict)
- Tailwind CSS
- shadcn/ui-style component architecture
- Zod validation (client + server)
- Typed mock data with `localStorage` persistence

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Run the app:

```bash
npm run dev
```

3. Open `http://localhost:3000`.

## Included Features

- Home, Menu, Product Detail, Cart + Checkout, Custom Cake Builder, Baking Classes, Contact, Admin
- PWA:
  - `public/manifest.webmanifest`
  - `public/sw.js`
  - Offline page at `/offline`
  - Static assets cached only (`/api` is excluded)
- Unsplash image integration with `next/image` and `images.unsplash.com` remote pattern
- Admin banner: `DEV MODE - No Authentication Enabled`
- Guest checkout only (no auth, no admin passwords)

## Project Structure

- `app/` routes, API validation endpoints, offline shell
- `components/` reusable UI and feature components
- `lib/` utilities, validation schemas, repository provider
- `repositories/` interfaces + local implementations
- `types/` domain models
- `data/` seeded mock products
- `admin/` admin dashboard module

## Supabase Integration Later

When moving from local dev to Supabase:

1. Keep interfaces in:
   - `repositories/product-repository.ts`
   - `repositories/order-repository.ts`
2. Add Supabase-backed implementations:
   - `repositories/supabase-product-repository.ts`
   - `repositories/supabase-order-repository.ts`
3. Swap the provider wiring in:
   - `lib/repository-provider.ts`
4. Preserve existing UI/pages because they depend on interfaces, not storage details.

## Validation Coverage

- Checkout: `lib/validation.ts` + `app/api/checkout/route.ts`
- Cake Builder: `lib/validation.ts` + `app/api/cake/route.ts`
- Admin product creation: `lib/validation.ts` + `app/api/admin/products/route.ts`

