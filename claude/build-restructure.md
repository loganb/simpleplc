# Build Restructure Task

## Goal

Stop mixing static-asset sources with build outputs in `frontend/public/`, and wire CSS/SCSS imports through the esbuild module graph so per-widget stylesheets can sit next to their components — modeled after the BioTrack analytics web project's CRA-style layout.

## Design

Three directories, three roles (CRA convention):

- `frontend/src/` — bundled code + colocated component styles (`.css` / `.scss`).
- `frontend/public/` — **static template source**: hand-written `index.html`, future `favicon.ico`, etc. Checked into git. Copied verbatim into the output directory at build time.
- `frontend/dist/` — build output. Gitignored. Contains everything served to the browser: copied static assets plus generated bundles (`app.js`, `app.css`, `index.css`).

Two CSS pipelines, both writing into `dist/`:

1. **Tailwind CLI subprocess** — reads `src/index.css` (which contains `@import "tailwindcss"` plus theme tokens), writes minified output to `dist/index.css`. Loaded via `<link rel="stylesheet" href="/index.css">`.
2. **esbuild module graph** — when `.css` or `.scss` files are imported from any TSX module, esbuild bundles them into a sibling `dist/app.css`. Component-scoped styles can live alongside their `.tsx` (e.g. `components/Foo/Foo.scss` imported by `Foo.tsx`). SCSS support comes from `esbuild-sass-plugin`.

The entry-point file `src/widgets.scss` is imported from `main.tsx` so esbuild always emits `dist/app.css` even if no component styles exist yet — gives the HTML's `<link>` tag something to point at.

Tradeoffs:

- Per-widget SCSS won't have Tailwind's `@apply` available, since Tailwind only runs over `src/index.css`. Use Tailwind utility classes in `className` for utility-style needs; reserve SCSS for things Tailwind can't express (complex selectors, animations, nested overrides).
- Two separate CSS files load on the page rather than one. Tradeoff for keeping the Tailwind pipeline simple (CLI subprocess) instead of wiring `@tailwindcss/node` into an esbuild plugin.

## Implementation Plan

1. Add `esbuild-sass-plugin` and `sass` to `frontend/package.json` devDependencies; run `npm install`.
2. Restructure `frontend/public/`:
   - Delete generated files (`app.js`, `app.js.map`, `index.css`); keep `index.html` as the static template source.
   - Update `.gitignore`: replace `frontend/public/` with `frontend/dist/`.
3. Rewrite `frontend/build.mjs`:
   - Constants for `PUBLIC_DIR='public'` and `OUT_DIR='dist'`.
   - On startup: `rm -rf dist/` (build only), `mkdir dist/`, copy `public/` → `dist/`.
   - Tailwind CLI subprocess writes to `dist/index.css`.
   - esbuild `outfile` becomes `dist/app.js`; CSS sibling auto-emits as `dist/app.css`.
   - Register `sassPlugin()` so `.scss` imports work.
   - In watch mode: `fs.watch('public', { recursive: true })` re-copies on change (small debounce).
   - Dev server `servedir: 'dist'`.
4. Add an esbuild CSS entry point:
   - Create `src/widgets.scss` with a header comment and no rules.
   - Import it from `src/main.tsx`.
   - Update `public/index.html` to add `<link rel="stylesheet" href="/app.css">` after the existing `/index.css` link.
5. Run `npm run build` and confirm `dist/` contains `index.html`, `app.js`, `app.css`, `index.css`. Briefly run `npm run dev` to confirm watch + serve work.
6. Update `claude/overview.md` with the new build layout and the two-pipeline CSS story.

## Out of Scope

- Wiring Tailwind into the esbuild module graph (the "step 5" from earlier discussion). Keeps `@apply` unavailable in component SCSS but avoids a custom esbuild plugin.
- Code-splitting CSS per route. Single `app.css` is fine until route-level chunking becomes useful.
