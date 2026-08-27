export type AreaId = "trading" | "data" | "web" | "realestate";

export type Area = {
  id: AreaId;
  label: string;
  description: string;
};

export type ProjectStatus = "live" | "in-progress" | "archived";

export type Project = {
  slug: string;
  title: string;
  /** One line, shown on cards and in the map preview. */
  tagline: string;
  /** One or two sentences, used for <meta name="description"> and OG. */
  description: string;
  area: AreaId;
  /** Secondary areas the project also relates to (map cross-links). */
  relatedAreas?: AreaId[];
  year: string;
  role: string;
  status: ProjectStatus;
  stack: string[];
  links: {
    repo?: string;
    live?: string;
  };
  /** Lower sorts first. */
  order: number;
  featured?: boolean;
};

export const areas: Record<AreaId, Area> = {
  trading: {
    id: "trading",
    label: "Trading",
    description: "Market data, order flow, and strategy systems.",
  },
  data: {
    id: "data",
    label: "Data",
    description: "Pipelines, caching, and analysis tooling.",
  },
  web: {
    id: "web",
    label: "Web",
    description: "Product-grade sites and interfaces.",
  },
  realestate: {
    id: "realestate",
    label: "Real Estate",
    description: "Tools and sites for property work.",
  },
};

export const projects: Project[] = [
  {
    slug: "ru-trading",
    title: "RU Trading",
    tagline:
      "Paper-trading platform with live market data, real order mechanics, and a strategy engine.",
    description:
      "A paper-trading web application that simulates stock market trading on real-time data. Built by a five-person team; I served as Scrum Lead and owned the data and caching layers.",
    area: "trading",
    relatedAreas: ["data", "web"],
    year: "2025",
    role: "Scrum Lead · five-person team",
    status: "live",
    stack: [
      "Next.js",
      "TypeScript",
      "FastAPI",
      "Python",
      "PostgreSQL",
      "Redis",
      "Drizzle ORM",
      "SQLAlchemy",
      "WebSockets",
      "Alpaca API",
    ],
    links: {
      // TODO: add the repository URL once it is public.
    },
    order: 1,
    featured: true,
  },
  {
    slug: "market-tool",
    title: "Market Tool",
    tagline: "A focused market-data tool built to ship a deliberately small v1.",
    description:
      "A lightweight market-data tool. Version one intentionally leaves out infrastructure like Redis and WebSockets in favor of shipping something small and correct.",
    area: "data",
    relatedAreas: ["trading"],
    year: "2025",
    role: "Solo",
    status: "in-progress",
    stack: ["TypeScript", "Next.js"],
    links: {},
    order: 2,
  },
  {
    slug: "sobti-solutions",
    title: "Sobti Solutions",
    tagline: "Marketing site for a real estate LLC.",
    description:
      "The public website for Sobti Solutions, a real estate LLC. Built to be fast, simple to maintain, and easy for clients to navigate.",
    area: "realestate",
    relatedAreas: ["web"],
    year: "2025",
    role: "Solo",
    status: "in-progress",
    stack: ["Next.js", "TypeScript", "Tailwind CSS"],
    links: {},
    order: 3,
  },
  {
    slug: "portfolio",
    title: "This Site",
    tagline:
      "An interactive force-directed map of my work, rendered in Canvas 2D on top of crawlable routes.",
    description:
      "This portfolio. The homepage is a force-directed map drawn with the Canvas 2D API and d3-force, layered over ordinary server-rendered case-study routes so it stays fast, accessible, and indexable.",
    area: "web",
    relatedAreas: ["data"],
    year: "2026",
    role: "Solo",
    status: "in-progress",
    stack: ["Next.js", "TypeScript", "Canvas 2D", "d3-force", "Tailwind CSS", "MDX"],
    links: {
      repo: "https://github.com/nitinsobti58/portfolio",
      live: "https://nitinsobti.com",
    },
    order: 4,
  },
];

export const sortedProjects = [...projects].sort((a, b) => a.order - b.order);

export const featuredProject =
  sortedProjects.find((p) => p.featured) ?? sortedProjects[0];

export function getProject(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export function getProjectsByArea(area: AreaId): Project[] {
  return sortedProjects.filter((p) => p.area === area);
}
