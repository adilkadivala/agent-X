# Changelog

All notable changes to this project will be documented in this file.

---

## [Unreleased] - Next.js 16.3

### Changed
- Upgrade to **Next.js 16.3.0** and **TypeScript 7** (`typescript@^7`) for faster `next build` type-checking (CLI)
- Enable **Instant Navigations**: `cacheComponents` + `partialPrefetching` (App Shells, Instant Insights, Partial Prefetch)
- Enable experimental **network resilience** (`useOffline`) and **Rust React Compiler** (`reactCompiler` + `turbopackRustReactCompiler`)
- Note: `pnpm lint` may crash with TS 7 until `typescript-eslint` gains a native TS 7 API (no JS compiler API in 7.0). Type-check remains covered by `pnpm build`

### Added
- Dashboard + auth `loading.tsx` shells for instant soft navigations
- Segment `error.tsx` / `global-error.tsx` with 16.3 `retry()` re-fetch
- `catchError` route error boundary for page content
- Offline reconnect banner via `next/offline`
- Cache Components fixes: Suspense around `usePathname` sidebar nav; `generateStaticParams` for blog detail

---

## [1.0.0] - 2026-07-18

### Added

**Dashboard**
- Modern Dashboard page with statistics, charts, and widgets

**Apps**
- Blog: create, edit, and delete blog posts with a rich text editor
- Notes: create and manage notes with drag-and-drop reordering
- Tickets: support ticket management with a Kanban board

**Authentication**
- Login page
- Register page
- Forgot Password page
- OTP Verification page
- Reset Password page
- Two-Factor Authentication page
- Error page
- Maintenance page

**Pages**
- User Profile page
- Vertical Form Layout
- Horizontal Form Layout
- Data Table

**General**
- Dark / Light mode toggle
- Icons showcase page
