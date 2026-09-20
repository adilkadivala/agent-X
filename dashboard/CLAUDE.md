# CLAUDE.md

This is a Next.js 16.3 (App Router) + React 19 + TypeScript 7 admin dashboard ("Shadcn Dashboard"), styled with Tailwind CSS v4 and Shadcn UI / Base UI primitives. It uses real Next.js Route Handlers under `app/api` as its backend (not a mocked SPA), deployed as a standard Next.js app.

## Stack

- **Framework**: Next.js 16.3 App Router, TypeScript 7, type-checked as part of `next build`
- **Instant Navigations**: `cacheComponents` + `partialPrefetching` enabled; prefer Suspense/`loading.tsx` shells and `'use cache'` for static shell content
- **Routing**: File-based App Router — route groups `app/auth/` (standalone) and `app/(dashboard-layout)/` (sidebar + header shell)
- **UI**: Shadcn UI / Base UI primitives (`@base-ui/react`), Tailwind CSS v4, `class-variance-authority`, `tailwind-merge`
- **Forms**: plain `useState` + shadcn UI primitives (`Input`, `Select`, `Switch`, `Checkbox`, `RadioGroup`, `Calendar`) — see `app/(dashboard-layout)/pages/form/page.tsx`
- **Data fetching**: `swr` calling real `app/api/**/route.ts` handlers (see `app/api/global-fetcher.ts`)
- **Charts**: `recharts` — see [Charts](#charts) below
- **Icons**: `lucide-react` (primary, per `components.json`) and `@iconify/react`
- **Rich text**: `@tiptap/*` — used in the blog post editor (`app/components/shared/editor/tiptap-edit.tsx`)

## Project structure

- `app/(dashboard-layout)/` — dashboard routes (page.tsx per route), plus `layout/`, `icons/`, `types/` for that shell
- `app/auth/` — login/register/forgot-password/2FA/error/maintenance, outside the dashboard shell
- `app/api/` — real Next.js Route Handlers (blog, notes, tickets, etc.)
- `app/components/` — app-scoped components (dashboards, apps, tables, shared, animated-components, user-profile, icons)
- `app/context/` — React context providers (blog, notes, tickets)
- `app/css/` — page/style-specific CSS
- `components/` — top-level shared components: `components/ui/` (shadcn primitives) and `Themeprovider.tsx`
- `hooks/`, `lib/` — reusable hooks and helpers (`lib/utils.ts` exports `cn()`)

## Conventions

- Path alias: `@/*` → project root (see `tsconfig.json`), matching the `components.json` shadcn aliases (`@/components`, `@/lib`, `@/components/ui`, `@/hooks`).
- Icons: prefer `lucide-react` (the configured `iconLibrary` in `components.json`); `@iconify/react` is used in some existing components — match whichever the file you're editing already imports.
- Data: features go through real API routes in `app/api/<feature>/route.ts`, consumed client-side via `swr` and the shared fetchers in `app/api/global-fetcher.ts`. Follow the blog/notes/ticket pattern for new features.
- Run `pnpm lint` (ESLint flat config extending `eslint-config-next`) before considering frontend changes done.
- `pnpm build` runs Next's own type-check as part of the build — type errors block it.

## Charts

- `recharts` — `app/components/dashboards/modern/total-sales.tsx`, `totals-assets.tsx`

## Deployment

No Docker/Netlify config in this repo — standard Next.js deployment (`pnpm build` + `pnpm start`, or a platform like Vercel).
