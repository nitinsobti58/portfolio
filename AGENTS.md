<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Portfolio — agent instructions

Read `docs/portfolio-map-plan.md` in full before writing code. It is the spec: goals, stack, data model, architecture, build phases, acceptance criteria, and known pitfalls.

## Stack

Next.js (App Router) + TypeScript, Tailwind CSS v4, shadcn/ui (Base UI, `base-nova` preset, lucide icons), Bun, `d3-force` + `d3-zoom` + `d3-selection` + `d3-transition` (individual modules only — never import `d3`), `motion`, `next-themes`, MDX via `@next/mdx`, ESLint 9, Vitest. Deploys to Vercel at https://nitinsobti.com.

## Layout

- `src/app` — routes. Case studies render from `src/content/projects/*.mdx` via `src/app/projects/[slug]`.
- `src/data` — static content: `projects.ts` (typed project metadata), `map.ts` (map graph).
- `src/components/map` — the Canvas 2D map and its modules. `src/components/projects` — grid, card, preview. `src/components/layout` — header, footer, theme toggle. `src/components/ui` — shadcn output (do not hand-edit).
- `src/lib/site.ts` — site name, URL, author. The only place the domain is written.

## Hard rules

- Canvas 2D only. No WebGL, PixiJS, Three.js, shaders, bloom, or glow aesthetics.
- Never store per-frame positions in React state. Positions live in refs/module scope; the overlay DOM is mutated directly. React re-renders only on discrete state changes.
- No per-particle gradients per frame. Pre-render a sprite once and `drawImage` it.
- Pre-settle the force simulation before first paint. The map must never visibly explode on load.
- Handle `devicePixelRatio`. Read CSS-variable colors once per theme change, never inside the frame loop.
- Mobile (<768px) never mounts the canvas. `prefers-reduced-motion` renders a static map.
- Every project must exist as a crawlable route with real semantic HTML. The map is an experience layer, not the only path.
- Repo is public. No secrets in code or history. `.env.local` is gitignored.

## Commits

- Plain, descriptive commit messages in the imperative mood. No trailers, no tool attribution, no generated sign-offs of any kind. The author is the repo owner's git identity.

## Workflow

- `bun dev` / `bun run build` / `bun run lint` / `bun run typecheck` / `bun run test`.
- Build phases are sequential (spec §8). Verify each phase's exit check before starting the next.
