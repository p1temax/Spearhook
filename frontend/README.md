# Spearhook Frontend (React)

International stack:

- **React 19** + **TypeScript**
- **Next.js** (App Router) with **`output: 'export'`** for static files embedded by Go
- **React Router** for in-app SPA routes (deep links work via Go `NoRoute` → `index.html`)
- **shadcn/ui (Nova preset)** — neutral OKLCH-derived tokens, Geist type, `--radius: 0.625rem`, light/dark themes
- **Light/dark toggle** — persisted in `spearhook.theme` via `stores/theme-store.ts`; first visit follows
  the OS preference and an inline script applies the class before paint (no flash). The legacy
  `slate-*` ramp is theme-aware, so older markup inverts with the theme.
- **Lucide** icons (`lucide-react`, the only icon set)
- **Motion** for transitions and micro-interactions (`motion/react`)
- **react-resizable-panels** for split panes (chat rail/thread)
- **dnd-kit** for drag interactions (page library reordering)
- **Zustand** for state (`auth-store`, `ui-store`, `page-order-store`, persisted where it is a preference)
- **Tailwind CSS**, **axios**, lightweight i18n (English source + zh-CN, zh-TW, ja, ko)

Legacy markup still uses the `slate-*` utilities; `tailwind.config.ts` aliases that ramp onto
the Nova neutral ramp so the palette stays single-sourced. New code should use the semantic
tokens (`bg-background`, `text-muted-foreground`, `border-border`, `bg-primary`, ...).

## Develop

```bash
# Backend on :8000 (CORS already open)
cd frontend
npm install
npm run dev   # http://127.0.0.1:8081  (API via NEXT_PUBLIC_API_BASE)
```

Static demo (mock data, no backend):

```bash
NEXT_PUBLIC_DEMO_MODE=1 npm run dev
```

## Checks

```bash
npm run test:helpers   # node:test suites (layout helpers, i18n parity)
npx tsc --noEmit
npm run build          # writes frontend/dist (used by //go:embed frontend/dist)
```

`scripts/build-all.sh` still runs `npm run build` then embeds `frontend/dist`.
