# nitinsobti.com

Personal portfolio. The homepage is an interactive force-directed map rendered in Canvas 2D; every project also lives at a normal, crawlable route with a written case study.

## Stack

- [Next.js](https://nextjs.org/) (App Router) + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- [d3-force](https://d3js.org/d3-force) + [d3-zoom](https://d3js.org/d3-zoom) for the map simulation and navigation
- MDX case studies, [Vitest](https://vitest.dev/), ESLint 9
- [Bun](https://bun.sh/) runtime, deployed on [Vercel](https://vercel.com/)

## Getting started

```bash
bun install
bun dev
```

Open http://localhost:3000.

## Scripts

```bash
bun dev             # start the dev server
bun run build       # production build
bun run start       # serve the production build
bun run lint        # eslint
bun run typecheck   # tsc --noEmit
bun run test        # vitest (single run)
bun run test:watch  # vitest in watch mode
```

## Structure

```
src/
├── app/                 # routes (App Router)
├── components/
│   ├── map/             # Canvas 2D portfolio map
│   ├── projects/        # project grid, cards, preview
│   ├── layout/          # header, footer, theme toggle
│   └── ui/              # shadcn/ui components
├── content/projects/    # case studies (MDX)
├── data/                # static content and map graph
└── lib/                 # utilities and site config
```
