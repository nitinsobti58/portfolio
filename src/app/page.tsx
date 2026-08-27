import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { MapSection } from "@/components/map/map-section";
import { ProjectGrid } from "@/components/projects/project-grid";
import { buttonVariants } from "@/components/ui/button";
import { featuredProject, sortedProjects } from "@/data/projects";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-4 py-16 sm:px-6 sm:py-24">
      <section className="flex flex-col gap-6">
        <h1 className="max-w-2xl text-4xl font-medium tracking-tight text-balance sm:text-5xl">
          {site.name}
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground text-pretty">
          Computer science student building software where finance meets
          technology: market data systems, trading tools, and the sites around
          them.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/projects/${featuredProject.slug}`}
            className={cn(buttonVariants({ size: "lg" }))}
          >
            Read the {featuredProject.title} case study
            <ArrowRight data-icon="inline-end" />
          </Link>
          <Link
            href="/about"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
          >
            About me
          </Link>
        </div>
      </section>

      <MapSection />

      <section className="flex flex-col gap-6">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-xl font-medium tracking-tight">Projects</h2>
          <Link
            href="/projects"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            View all
          </Link>
        </div>
        <ProjectGrid projects={sortedProjects} />
      </section>
    </main>
  );
}
