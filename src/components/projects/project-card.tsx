import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { areas, type Project } from "@/data/projects";
import { cn } from "@/lib/utils";

type Props = {
  project: Project;
  className?: string;
  /**
   * Below 768px a card; from 768px up a single row (title, tagline, area ·
   * year) with the stack left out. The homepage uses it under the map, where
   * the full cards would repeat what the map already shows.
   */
  compact?: boolean;
};

export function ProjectCard({ project, className, compact = false }: Props) {
  const href = `/projects/${project.slug}`;

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-5 transition-colors hover:border-foreground/30",
        compact && "md:flex-row md:flex-wrap md:items-baseline md:gap-x-4 md:gap-y-1 md:rounded-lg md:px-4 md:py-3 md:pr-10",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 text-xs text-muted-foreground",
          compact && "md:order-last md:ml-auto md:shrink-0 md:gap-1",
        )}
      >
        <span>{areas[project.area].label}</span>
        {compact && <span aria-hidden className="hidden md:inline">·</span>}
        <span>{project.year}</span>
      </div>
      <h3 className={cn("text-lg font-medium tracking-tight", compact && "md:text-base")}>
        <Link href={href} className="after:absolute after:inset-0 after:content-['']">
          {project.title}
        </Link>
      </h3>
      <p className={cn("text-sm text-muted-foreground", compact && "md:min-w-0 md:flex-1")}>
        {project.tagline}
      </p>
      <div className={cn("mt-auto flex flex-wrap gap-1.5 pt-2", compact && "md:hidden")}>
        {project.stack.slice(0, 4).map((tech) => (
          <Badge key={tech} variant="secondary">
            {tech}
          </Badge>
        ))}
      </div>
      <ArrowUpRight
        aria-hidden
        className={cn(
          "absolute top-5 right-5 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100",
          compact && "md:top-1/2 md:right-4 md:-translate-y-1/2",
        )}
      />
    </article>
  );
}
