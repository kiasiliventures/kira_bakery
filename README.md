# KiRA Bakery PWA

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

- Home, Menu, Product Detail, Cart + Checkout, Custom Cake Builder, Baking Classes, Contact
- PWA:
  - `public/manifest.webmanifest`
  - `public/sw.js`
  - Offline page at `/offline`
  - Static assets cached only (`/api` is excluded)
- Unsplash image integration with `next/image` and `images.unsplash.com` remote pattern
- Guest checkout only (no auth)

## Project Structure

- `app/` routes, API validation endpoints, offline shell
- `components/` reusable UI and feature components
- `lib/` utilities, validation schemas, repository provider
- `repositories/` interfaces + local implementations
- `types/` domain models
- `data/` seeded mock products

## Supabase Integration

Product reads, checkout, and cake requests are backed by Supabase.

## Validation Coverage

- Checkout: `lib/validation.ts` + `app/api/checkout/route.ts`
- Cake Builder: `lib/validation.ts` + `app/api/cake/route.ts`
