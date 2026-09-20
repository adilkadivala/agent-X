---
name: shadcn-dashboard
description: |
  Guide for building pages, features, tables, forms, API routes, and navigation in this Next.js 16 App Router + React 19 shadcn/Base UI admin dashboard. Use this skill whenever the user wants to add a new page, wire up an API route, build a data table, add a form, configure the sidebar, add charts, or work with this dashboard's existing conventions. Also triggers when the user asks about icon usage or theming (dark/light). Even if the user doesn't say "dashboard" explicitly — if they're adding UI, pages, or features to this project, use this skill.
---

# Shadcn Dashboard (Next.js) Development Guide

This skill encodes the exact patterns and conventions used in this Next.js App Router admin dashboard. Following these patterns keeps new code consistent with the existing codebase. See [AGENTS.md](../../../AGENTS.md) for the fuller reference this skill is derived from.

## Quick Reference: What Goes Where

| Task                          | Location                                                          |
| ------------------------------ | ------------------------------------------------------------------ |
| New dashboard page              | `app/(dashboard-layout)/<area>/<page>/page.tsx`                    |
| New standalone page (auth, etc.) | `app/auth/<area>/page.tsx`                                       |
| Sidebar nav entry                 | `app/(dashboard-layout)/layout/vertical/sidebar/sidebaritems.ts` |
| Reusable feature component          | `app/components/<domain>/`                                     |
| shadcn-style primitive                | `components/ui/`                                              |
| API route handler                       | `app/api/<feature>/route.ts`                                |
| SWR fetchers                              | `app/api/global-fetcher.ts`                                |
| Feature state/context                       | `app/context/<feature>-context/`                         |
| Shared types                                  | `app/(dashboard-layout)/types/apps/<feature>.ts`       |
| Custom hooks                                    | `hooks/`                                             |
| Tailwind/global styles                            | `app/globals.css`, `app/css/`                      |

## Adding a New Feature

1. Add a Route Handler at `app/api/<name>/route.ts` (plus a `<name>-data.ts` helper if it needs static/seed data, following `app/api/blog/route.ts`).
2. Create a context in `app/context/<name>-context/` that fetches via `useSWR` + the shared fetchers in `app/api/global-fetcher.ts`, exposing state + setters.
3. Build the view under `app/(dashboard-layout)/apps/<name>/` (or the appropriate `pages/` subfolder), composing components from `app/components/<name>/` and shadcn primitives from `components/ui/`.
4. Since routing is file-based, adding `page.tsx` in the right folder is enough — no manual route registration.
5. Add a sidebar nav item if the page should be reachable from the sidebar (`app/(dashboard-layout)/layout/vertical/sidebar/sidebaritems.ts`).

## Data Fetching Pattern

- This project has a **real backend**: Next.js Route Handlers under `app/api/**/route.ts`, not mocked/SPA data.
- `app/api/global-fetcher.ts` exports fetcher functions for use with `useSWR`/mutations.
- Follow the blog/notes/ticket pattern for new features: route handler → context → view.

## Data Tables

Use the wrappers in `app/components/tables/` (e.g. `DataTable.tsx`) which wrap TanStack Table (`@tanstack/react-table`). Don't hand-roll a new table implementation.

## Forms

Use plain `useState` + shadcn UI primitives (`Input`, `Select`, `Switch`, `Checkbox`, `RadioGroup`, `Calendar` from `components/ui/`), following `app/(dashboard-layout)/pages/form/` as the reference pattern.

## Charts

- `recharts` — dashboard widgets, e.g. `app/components/dashboards/modern/total-sales.tsx`, `totals-assets.tsx`

## Icons

`components.json` configures `lucide-react` as the default icon library. `@iconify/react` also appears in several existing components (tables, dashboards). Match whichever the file you're editing already imports.

## Code Conventions

- Use `cn()` from `lib/utils.ts` for class merging — never concatenate className strings.
- Path alias `@/*` resolves to the project root — match the convention already used in the file you're editing.
- `pnpm build` runs Next's type-check before the production build; type errors block it.
- `pnpm lint` runs ESLint (flat config extending `eslint-config-next`) — fix warnings, don't suppress them.
- Package manager is **pnpm** (`pnpm-lock.yaml`) — don't introduce npm/yarn/bun lockfiles or commands.
