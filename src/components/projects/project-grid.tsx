import { ProjectCard } from "@/components/projects/project-card";
import type { Project } from "@/data/projects";

type Props = {
  projects: Project[];
  /** Accessible name for the list. */
  label?: string;
};

export function ProjectGrid({ projects, label = "Projects" }: Props) {
  return (
    <ul aria-label={label} className="grid gap-4 sm:grid-cols-2">
      {projects.map((project) => (
        <li key={project.slug} className="flex">
          <ProjectCard project={project} className="w-full" />
        </li>
      ))}
    </ul>
  );
}
