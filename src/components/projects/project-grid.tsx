import { ProjectCard } from "@/components/projects/project-card";
import type { Project } from "@/data/projects";
import { cn } from "@/lib/utils";

type Props = {
  projects: Project[];
  /** Accessible name for the list. Leave unset when an ancestor landmark already names it. */
  label?: string;
  /** Row layout at ≥768px, for a list that sits under the map and must not compete with it. */
  compact?: boolean;
};

export function ProjectGrid({ projects, label, compact = false }: Props) {
  return (
    <ul
      aria-label={label}
      className={cn("grid gap-4 sm:grid-cols-2", compact && "md:grid-cols-1 md:gap-2")}
    >
      {projects.map((project) => (
        <li key={project.slug} className="flex">
          <ProjectCard project={project} compact={compact} className="w-full" />
        </li>
      ))}
    </ul>
  );
}
