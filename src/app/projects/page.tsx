import type { Metadata } from "next";

import { ProjectGrid } from "@/components/projects/project-grid";
import { sortedProjects } from "@/data/projects";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Case studies: a paper-trading platform, a market-data tool, a real estate site, and this portfolio.",
  alternates: { canonical: "/projects" },
};

export default function ProjectsPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-16 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-medium tracking-tight">Projects</h1>
        <p className="max-w-xl text-muted-foreground">
          Each project has a written case study covering the problem, the
          decisions, and what I&apos;d change.
        </p>
      </div>
      <ProjectGrid projects={sortedProjects} label="All projects" />
    </main>
  );
}
