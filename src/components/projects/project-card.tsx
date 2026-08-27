import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { areas, type Project } from "@/data/projects";
import { cn } from "@/lib/utils";

type Props = {
  project: Project;
  className?: string;
};

export function ProjectCard({ project, className }: Props) {
  const href = `/projects/${project.slug}`;

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-5 transition-colors hover:border-foreground/30",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{areas[project.area].label}</span>
        <span>{project.year}</span>
      </div>
      <h3 className="text-lg font-medium tracking-tight">
        <Link href={href} className="after:absolute after:inset-0 after:content-['']">
          {project.title}
        </Link>
      </h3>
      <p className="text-sm text-muted-foreground">{project.tagline}</p>
      <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
        {project.stack.slice(0, 4).map((tech) => (
          <Badge key={tech} variant="secondary">
            {tech}
          </Badge>
        ))}
      </div>
      <ArrowUpRight
        aria-hidden
        className="absolute top-5 right-5 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
      />
    </article>
  );
}
